#include <algorithm>
#include <arpa/inet.h>
#include <chrono>
#include <cmath>
#include <cstring>
#include <dirent.h>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <mosquitto.h>
#include <nlohmann/json.hpp>
#include <regex>
#include <sstream>
#include <string>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/time.h> // Necesario para Alpine/musl
#include <thread>
#include <unistd.h>
#include <vector>

using json = nlohmann::json;

// === Configuración ===
struct AppConfig {
  int delay_between_inverters_ms = 1000;
  int delay_between_cycles_ms = 5000;
  std::string mqtt_broker_ip = "127.0.0.1";
  int mqtt_broker_port = 1883;
  std::string mqtt_user = "";
  std::string mqtt_password = "";
  std::string inverter1_tcp_ip = "10.0.0.235";
  int inverter1_tcp_port = 26;
};
AppConfig g_config;

const std::string LOG_DIR = "log";
const int MAX_LOG_FILES = 5;
std::ofstream g_logFile;

// === Logger ===
void logMessage(const std::string &msg) {
  auto now = std::chrono::system_clock::now();
  auto time_t = std::chrono::system_clock::to_time_t(now);
  auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                now.time_since_epoch()) %
            1000;
  std::tm tm;
  localtime_r(&time_t, &tm);
  std::ostringstream oss;
  oss << std::put_time(&tm, "%Y-%m-%d %H:%M:%S");
  oss << '.' << std::setfill('0') << std::setw(3) << ms.count();
  oss << " | " << msg;
  std::string fullMsg = oss.str();
  std::cout << fullMsg << std::endl;
  if (g_logFile.is_open()) {
    g_logFile << fullMsg << std::endl;
    g_logFile.flush();
  }
}

void createLogDir() {
  struct stat info;
  if (stat(LOG_DIR.c_str(), &info) != 0) {
    mkdir(LOG_DIR.c_str(), 0755);
    logMessage("📁 Directorio de logs creado: " + LOG_DIR);
  }
}

void rotateLogs() {
  std::vector<std::string> logFiles;
  DIR *dir = opendir(LOG_DIR.c_str());
  if (!dir)
    return;
  struct dirent *entry;
  std::regex logPattern("axpert_monitor_\\d{8}_\\d{6}\\.log");
  while ((entry = readdir(dir)) != nullptr) {
    if (std::regex_match(entry->d_name, logPattern)) {
      logFiles.push_back(LOG_DIR + "/" + std::string(entry->d_name));
    }
  }
  closedir(dir);
  std::sort(logFiles.begin(), logFiles.end(), std::greater<>());
  if (logFiles.size() > MAX_LOG_FILES) {
    for (size_t i = MAX_LOG_FILES; i < logFiles.size(); ++i) {
      std::remove(logFiles[i].c_str());
      logMessage("🗑️  Log antiguo eliminado: " + logFiles[i]);
    }
  }
}

void initLogger() {
  createLogDir();
  auto now = std::chrono::system_clock::now();
  auto time_t = std::chrono::system_clock::to_time_t(now);
  std::tm tm;
  localtime_r(&time_t, &tm);
  std::ostringstream oss;
  oss << LOG_DIR << "/axpert_monitor_" << std::put_time(&tm, "%Y%m%d_%H%M%S")
      << ".log";
  std::string logFileName = oss.str();
  rotateLogs();
  g_logFile.open(logFileName, std::ios::out);
  logMessage("Intialized logger: " + logFileName);
}

// === Carga de configuración desde config/app_config.json ===
AppConfig loadConfig() {
  AppConfig config;
  std::ifstream configFile("config/app_config.json");
  if (!configFile.is_open()) {
    logMessage(
        "⚠️ config/app_config.json no encontrado. Usando valores por defecto.");
    return config;
  }
  try {
    json j;
    configFile >> j;

    if (j.contains("delay_between_inverters_ms") &&
        j["delay_between_inverters_ms"].is_number_integer()) {
      config.delay_between_inverters_ms =
          j["delay_between_inverters_ms"].get<int>();
      if (config.delay_between_inverters_ms < 100)
        config.delay_between_inverters_ms = 100;
    }

    if (j.contains("inverter1_tcp_ip") && j["inverter1_tcp_ip"].is_string()) {
      config.inverter1_tcp_ip = j["inverter1_tcp_ip"].get<std::string>();
    }
    if (j.contains("inverter1_tcp_port") &&
        j["inverter1_tcp_port"].is_number_integer()) {
      config.inverter1_tcp_port = j["inverter1_tcp_port"].get<int>();
      if (config.inverter1_tcp_port < 1 || config.inverter1_tcp_port > 65535) {
        config.inverter1_tcp_port = 26;
      }
    }

    if (j.contains("mqtt_broker_ip") && j["mqtt_broker_ip"].is_string()) {
      config.mqtt_broker_ip = j["mqtt_broker_ip"].get<std::string>();
    }
    if (j.contains("mqtt_broker_port") &&
        j["mqtt_broker_port"].is_number_integer()) {
      config.mqtt_broker_port = j["mqtt_broker_port"].get<int>();
    }
    if (j.contains("mqtt_user") && j["mqtt_user"].is_string()) {
      config.mqtt_user = j["mqtt_user"].get<std::string>();
    }
    if (j.contains("mqtt_password") && j["mqtt_password"].is_string()) {
      config.mqtt_password = j["mqtt_password"].get<std::string>();
    }

    logMessage("⚙️  Configuración cargada desde config/app_config.json");
  } catch (const std::exception &e) {
    logMessage("⚠️ Error al parsear config/app_config.json: " +
               std::string(e.what()));
  }
  return config;
}

// === MQTT ===
const char *TOPIC_INV0 = "homeassistant/axpert/inv01";
const char *TOPIC_INV1 = "homeassistant/axpert/inv02";
const char *TOPIC_TOTALS = "homeassistant/axpert/totales";

void publishMQTT(struct mosquitto *mosq, const char *topic, const json &data) {
  std::string payload = data.dump();
  int ret = mosquitto_publish(mosq, nullptr, topic, payload.length(),
                              payload.c_str(), 0, true);
  if (ret != MOSQ_ERR_SUCCESS) {
    logMessage("❌ Fallo al publicar en MQTT: " + std::string(topic));
  } else {
    logMessage("✅ Publicado (retain) en: " + std::string(topic));
  }
}

// === Comunicación con inversores ===
void flushSocket(int sockfd) {
  char dummy[256];
  struct timeval timeout;
  timeout.tv_sec = 0;
  timeout.tv_usec = 50000;
  setsockopt(sockfd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
  while (recv(sockfd, dummy, sizeof(dummy), MSG_DONTWAIT) > 0) {
  }
  timeout.tv_sec = 5;
  timeout.tv_usec = 0;
  setsockopt(sockfd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
}

std::string
sendCommandAndGetCleanResponse(int sockfd,
                               const std::vector<uint8_t> &command) {
  flushSocket(sockfd);
  if (send(sockfd, command.data(), command.size(), 0) < 0) {
    throw std::runtime_error("Error al enviar comando");
  }
  std::string raw;
  char buffer[1];
  ssize_t bytes;
  while ((bytes = recv(sockfd, buffer, 1, 0)) > 0) {
    if (buffer[0] == 0x0D)
      break;
    raw += buffer[0];
  }
  if (bytes <= 0)
    throw std::runtime_error("Timeout en recepción");
  size_t start = raw.find('(');
  if (start == std::string::npos)
    throw std::runtime_error("No se encontró '('");
  return raw.substr(start + 1);
}

// === Decodificación ===
void addFaultFlags(json &j, const std::string &faultStr) {
  j["01_fan_locked"] = 0;
  j["02_over_temperature"] = 0;
  j["03_battery_voltage_high"] = 0;
  j["04_battery_voltage_low"] = 0;
  j["05_output_short_circuited"] = 0;
  j["06_output_voltage_high"] = 0;
  j["07_overload_timeout"] = 0;
  j["08_bus_voltage_high"] = 0;
  j["09_bus_soft_start_failed"] = 0;
  j["10_pv_over_current"] = 0;
  j["11_pv_over_voltage"] = 0;
  j["12_dcdc_over_current"] = 0;
  j["13_battery_discharge_over_current"] = 0;
  j["51_over_current"] = 0;
  j["52_bus_voltage_low"] = 0;
  j["53_inverter_soft_start_failed"] = 0;
  j["55_over_dc_voltage_in_ac_output"] = 0;
  j["57_current_sensor_failed"] = 0;
  j["58_output_voltage_low"] = 0;
  j["60_power_feedback_protection"] = 0;
  j["71_firmware_version_inconsistent"] = 0;
  j["72_current_sharing_fault"] = 0;
  j["80_can_fault"] = 0;
  j["81_host_loss"] = 0;
  j["82_synchronization_loss"] = 0;
  j["83_battery_voltage_diff_parallel"] = 0;
  j["84_ac_input_diff_parallel"] = 0;
  j["85_ac_output_unbalance"] = 0;
  j["86_ac_output_mode_diff"] = 0;

  if (faultStr == "00")
    return;
  int code = 0;
  try {
    code = std::stoi(faultStr);
  } catch (...) {
    return;
  }

  switch (code) {
  case 1:
    j["01_fan_locked"] = 1;
    break;
  case 2:
    j["02_over_temperature"] = 1;
    break;
  case 3:
    j["03_battery_voltage_high"] = 1;
    break;
  case 4:
    j["04_battery_voltage_low"] = 1;
    break;
  case 5:
    j["05_output_short_circuited"] = 1;
    break;
  case 6:
    j["06_output_voltage_high"] = 1;
    break;
  case 7:
    j["07_overload_timeout"] = 1;
    break;
  case 8:
    j["08_bus_voltage_high"] = 1;
    break;
  case 9:
    j["09_bus_soft_start_failed"] = 1;
    break;
  case 10:
    j["10_pv_over_current"] = 1;
    break;
  case 11:
    j["11_pv_over_voltage"] = 1;
    break;
  case 12:
    j["12_dcdc_over_current"] = 1;
    break;
  case 13:
    j["13_battery_discharge_over_current"] = 1;
    break;
  case 51:
    j["51_over_current"] = 1;
    break;
  case 52:
    j["52_bus_voltage_low"] = 1;
    break;
  case 53:
    j["53_inverter_soft_start_failed"] = 1;
    break;
  case 55:
    j["55_over_dc_voltage_in_ac_output"] = 1;
    break;
  case 57:
    j["57_current_sensor_failed"] = 1;
    break;
  case 58:
    j["58_output_voltage_low"] = 1;
    break;
  case 60:
    j["60_power_feedback_protection"] = 1;
    break;
  case 71:
    j["71_firmware_version_inconsistent"] = 1;
    break;
  case 72:
    j["72_current_sharing_fault"] = 1;
    break;
  case 80:
    j["80_can_fault"] = 1;
    break;
  case 81:
    j["81_host_loss"] = 1;
    break;
  case 82:
    j["82_synchronization_loss"] = 1;
    break;
  case 83:
    j["83_battery_voltage_diff_parallel"] = 1;
    break;
  case 84:
    j["84_ac_input_diff_parallel"] = 1;
    break;
  case 85:
    j["85_ac_output_unbalance"] = 1;
    break;
  case 86:
    j["86_ac_output_mode_diff"] = 1;
    break;
  default:
    break;
  }
}

void addInverterStatusFlags(json &j, const std::string &statusStr) {
  j["alarm_scc_loss"] = 0;
  j["status_ac_charging"] = 0;
  j["status_solar_charging"] = 0;
  j["alarm_battery_health"] = 0;
  j["alarm_line_loss"] = 0;
  j["status_load_on"] = 0;
  j["status_configuration"] = 0;

  if (statusStr.size() != 8)
    return;
  for (char c : statusStr)
    if (c != '0' && c != '1')
      return;

  char b7 = statusStr[0];
  char b6 = statusStr[1];
  char b5 = statusStr[2];
  char b4 = statusStr[3];
  char b3 = statusStr[4];
  char b2 = statusStr[5];
  char b1 = statusStr[6];
  char b0 = statusStr[7];

  j["alarm_scc_loss"] = (b7 == '0') ? 1 : 0;
  j["status_ac_charging"] = (b6 == '1') ? 1 : 0;
  j["status_solar_charging"] = (b5 == '1') ? 1 : 0;
  j["alarm_battery_health"] = (b4 == '0' && b3 == '0') ? 0 : 1;
  j["alarm_line_loss"] = (b2 == '1') ? 1 : 0;
  j["status_load_on"] = (b1 == '1') ? 1 : 0;
  j["status_configuration"] = (b0 == '1') ? 1 : 0;
}

json parseQPGS(const std::string &cleanResponse, const std::string &inverterId,
               std::string &out_fault_code, std::string &out_inverter_status) {
    std::istringstream iss(cleanResponse);
    std::vector<std::string> fields;
    std::string field;
    while (iss >> field) {
        fields.push_back(field);
    }
    if (fields.size() < 28) {
        throw std::runtime_error("Menos de 28 campos en QPGS");
    }

    out_fault_code = fields[3];
    out_inverter_status = fields[19];

    auto to_double = [](const std::string &s) -> double {
        try {
            return std::stod(s);
        } catch (...) {
            return 0.0;
        }
    };
    auto to_int = [](const std::string &s) -> int {
        try {
            return std::stoi(s);
        } catch (...) {
            return 0;
        }
    };
    auto round2 = [](double value) -> double {
        return std::round(value * 100.0) / 100.0;
    };

    // --- PV cálculos (campos 14, 25, 27) ---
    double pv1_v = round2(to_double(fields[14])); // PV1 voltage
    double pv2_v = round2(to_double(fields[27])); // PV2 voltage
    double pv_total_i = round2(to_double(fields[25])); // Total PV current
    double pv1_i = 0.0, pv2_i = 0.0;

    if (pv1_v + pv2_v > 0.1) {
        pv1_i = pv_total_i * (pv1_v / (pv1_v + pv2_v));
        pv2_i = pv_total_i * (pv2_v / (pv1_v + pv2_v));
    } else {
        pv1_i = pv_total_i;
        pv2_i = 0.0;
    }
    pv1_i = round2(pv1_i);
    pv2_i = round2(pv2_i);
    double pv1_p = round2(pv1_v * pv1_i);
    double pv2_p = round2(pv2_v * pv2_i);

    json j;
    j["inverter_id"] = inverterId;
    j["parallel_configuration"] = fields[0];
    j["serial_number"] = fields[1];
    j["work_mode"] = fields[2];
    j["grid_input_voltage"] = round2(to_double(fields[4]));
    j["grid_input_frequency"] = round2(to_double(fields[5]));
    j["ac_output_voltage"] = round2(to_double(fields[6]));
    j["ac_output_frequency"] = round2(to_double(fields[7]));
    j["ac_output_apparent_power"] = to_int(fields[8]);
    j["ac_output_active_power"] = to_int(fields[9]);

    double ac_apparent = static_cast<double>(to_int(fields[8]));
    double ac_active = static_cast<double>(to_int(fields[9]));
    double ac_reactive = std::round((ac_apparent - ac_active) * 100.0) / 100.0;
    j["ac_output_reactive_power"] = ac_reactive;

    j["load_percentage"] = to_int(fields[10]);
    j["battery_voltage"] = round2(to_double(fields[11]));
    j["battery_charging_current"] = to_int(fields[12]);
    j["battery_soc"] = to_int(fields[13]);
    j["pv1_input_voltaje"] = pv1_v;
    // 🔸 IMPORTANTE: LEER field[15] aunque no lo guardemos
    int battery_total_charging = to_int(fields[15]); // <-- Necesario para no desplazar índices
    // j["battery_total_all_inputs_charging_current"] = battery_total_charging; // NO se incluye

    j["output_mode"] = to_int(fields[20]);
    j["charger_source_priority"] = to_int(fields[21]);
    j["config_max_charger_current"] = to_int(fields[22]);
    j["config_max_charge_range"] = to_int(fields[23]);
    j["config_max_ac_charger_current"] = to_int(fields[24]); // ← usado en cálculo AC power

    j["pv_total_input_current"] = pv_total_i; // ← Este se mantiene (reemplaza "total_inv_pv_input_current")
    j["battery_discharge_current"] = to_int(fields[26]);
    j["pv2_input_voltaje"] = pv2_v;
    j["pv1_input_current"] = pv1_i;
    j["pv2_input_current"] = pv2_i;
    j["pv1_input_power"] = pv1_p;
    j["pv2_input_power"] = pv2_p;

    // 🔸 CALCULO: battery_real_charge_current
    int charging = j["battery_charging_current"].get<int>();
    int discharging = j["battery_discharge_current"].get<int>();
    double battery_real_charge = 0.0;
    if (charging > 0 && discharging == 0) {
        battery_real_charge = static_cast<double>(charging);
    } else if (charging == 0 && discharging > 0) {
        battery_real_charge = -static_cast<double>(discharging);
    } else if (charging > 0 && discharging > 0) {
        battery_real_charge = static_cast<double>(charging - discharging);
    }
    battery_real_charge = round2(battery_real_charge);
    j["battery_real_charge_current"] = battery_real_charge;

    // 🔸 CALCULO: battery_real_power = real_charge * battery_voltage
    double battery_voltage = j["battery_voltage"].get<double>();
    double battery_real_power = round2(battery_real_charge * battery_voltage);
    j["battery_real_power"] = battery_real_power;

    // 🔸 CALCULO: ac_input_power_estimate = grid_voltage * config_max_ac_charger_current
    double grid_voltage = j["grid_input_voltage"].get<double>();
    int max_ac_charger = j["config_max_ac_charger_current"].get<int>();
    double ac_input_power_estimate = round2(grid_voltage * static_cast<double>(max_ac_charger));
    j["ac_input_power_estimate"] = ac_input_power_estimate;

    addFaultFlags(j, out_fault_code);
    addInverterStatusFlags(j, out_inverter_status);
    return j;
}

bool hasAnyAlarm(const json &j) {
  std::vector<std::string> alarmFields = {"alarm_scc_loss",
                                          "01_fan_locked",
                                          "02_over_temperature",
                                          "03_battery_voltage_high",
                                          "04_battery_voltage_low",
                                          "05_output_short_circuited",
                                          "06_output_voltage_high",
                                          "07_overload_timeout",
                                          "08_bus_voltage_high",
                                          "09_bus_soft_start_failed",
                                          "10_pv_over_current",
                                          "11_pv_over_voltage",
                                          "12_dcdc_over_current",
                                          "13_battery_discharge_over_current",
                                          "51_over_current",
                                          "52_bus_voltage_low",
                                          "53_inverter_soft_start_failed",
                                          "55_over_dc_voltage_in_ac_output",
                                          "57_current_sensor_failed",
                                          "58_output_voltage_low",
                                          "60_power_feedback_protection",
                                          "71_firmware_version_inconsistent",
                                          "72_current_sharing_fault",
                                          "80_can_fault",
                                          "81_host_loss",
                                          "82_synchronization_loss",
                                          "83_battery_voltage_diff_parallel",
                                          "84_ac_input_diff_parallel",
                                          "85_ac_output_unbalance",
                                          "86_ac_output_mode_diff"};
  for (const auto &field : alarmFields) {
    if (j.contains(field) && j[field] == 1) {
      return true;
    }
  }
  return false;
}

// === main ===
int main() {
  initLogger();
  logMessage("🚀 Iniciando axpert_monitor en modo continuo (recarga config en cada ciclo)...");

  // --- Iniciar MQTT ---
  mosquitto_lib_init();
  struct mosquitto *mosq = mosquitto_new("axpert_monitor", true, nullptr);
  if (!mosq) {
    logMessage("❌ Error al crear cliente MQTT");
    return 1;
  }

  // Bucle infinito
  while (true) {
    g_config = loadConfig();

    if (!g_config.mqtt_user.empty()) {
      mosquitto_username_pw_set(mosq, g_config.mqtt_user.c_str(),
                                g_config.mqtt_password.c_str());
    }

    int rc = mosquitto_connect(mosq, g_config.mqtt_broker_ip.c_str(),
                               g_config.mqtt_broker_port, 60);
    if (rc != MOSQ_ERR_SUCCESS) {
      logMessage("❌ Fallo al conectar al broker MQTT: " +
                 std::string(mosquitto_strerror(rc)));
      std::this_thread::sleep_for(
          std::chrono::milliseconds(g_config.delay_between_cycles_ms));
      continue;
    }

    logMessage("🔄 Nueva iteración (modo continuo)");

    int sockfd = socket(AF_INET, SOCK_STREAM, 0);
    if (sockfd < 0) {
      logMessage("❌ Error al crear socket TCP");
      std::this_thread::sleep_for(
          std::chrono::milliseconds(g_config.delay_between_cycles_ms));
      continue;
    }

    struct timeval timeout;
    timeout.tv_sec = 5;
    timeout.tv_usec = 0;
    setsockopt(sockfd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));

    struct sockaddr_in server_addr{};
    server_addr.sin_family = AF_INET;
    server_addr.sin_port = htons(g_config.inverter1_tcp_port);
    if (inet_pton(AF_INET, g_config.inverter1_tcp_ip.c_str(),
                  &server_addr.sin_addr) <= 0) {
      logMessage("❌ IP de inversor inválida: " + g_config.inverter1_tcp_ip);
      close(sockfd);
      std::this_thread::sleep_for(
          std::chrono::milliseconds(g_config.delay_between_cycles_ms));
      continue;
    }

    if (connect(sockfd, (struct sockaddr *)&server_addr, sizeof(server_addr)) < 0) {
      logMessage("❌ Fallo al conectar al conversor TCP/serial en " +
                 g_config.inverter1_tcp_ip + ":" +
                 std::to_string(g_config.inverter1_tcp_port));
      close(sockfd);
      std::this_thread::sleep_for(
          std::chrono::milliseconds(g_config.delay_between_cycles_ms));
      continue;
    }

    try {
      std::vector<uint8_t> cmd_qpgs0 = {0x51, 0x50, 0x47, 0x53,
                                        0x30, 0x3f, 0xda, 0x0d};
      std::vector<uint8_t> cmd_qpgs1 = {0x51, 0x50, 0x47, 0x53,
                                        0x31, 0x2f, 0xbb, 0x0d};

      std::string resp0 = sendCommandAndGetCleanResponse(sockfd, cmd_qpgs0);
      std::this_thread::sleep_for(
          std::chrono::milliseconds(g_config.delay_between_inverters_ms));
      std::string resp1 = sendCommandAndGetCleanResponse(sockfd, cmd_qpgs1);

      std::string fault0, status0, fault1, status1;
      json inv0 = parseQPGS(resp0, "QPGS0", fault0, status0);
      json inv1 = parseQPGS(resp1, "QPGS1", fault1, status1);

      // 🔍 [OPCIONAL] Logs de depuración (puedes comentarlos si no los necesitas)
      logMessage("DEBUG inv0 battery_real_charge_current: " + std::to_string(inv0["battery_real_charge_current"].get<double>()));
      logMessage("DEBUG inv0 ac_input_power_estimate: " + std::to_string(inv0["ac_input_power_estimate"].get<double>()));
      logMessage("DEBUG inv1 battery_real_charge_current: " + std::to_string(inv1["battery_real_charge_current"].get<double>()));

      // === CÁLCULOS ===
      double total_system_battery_real_charge =
          inv0["battery_real_charge_current"].get<double>() +
          inv1["battery_real_charge_current"].get<double>();
      total_system_battery_real_charge = std::round(total_system_battery_real_charge * 100.0) / 100.0;

      double total_system_battery_power =
          inv0["battery_real_power"].get<double>() +
          inv1["battery_real_power"].get<double>();
      total_system_battery_power = std::round(total_system_battery_power * 100.0) / 100.0;

      double total_system_estimate_ac_input_power =
          inv0["ac_input_power_estimate"].get<double>() +
          inv1["ac_input_power_estimate"].get<double>();
      total_system_estimate_ac_input_power = std::round(total_system_estimate_ac_input_power * 100.0) / 100.0;

      int total_charging = inv0["battery_charging_current"].get<int>() +
                           inv1["battery_charging_current"].get<int>();
      int total_discharge = inv0["battery_discharge_current"].get<int>() +
                            inv1["battery_discharge_current"].get<int>();
      double avg_battery_voltage =
          std::round((inv0["battery_voltage"].get<double>() +
                      inv1["battery_voltage"].get<double>()) *
                     50.0) /
          100.0;
      int total_system_load_percentage = inv0["load_percentage"].get<int>() +
                                         inv1["load_percentage"].get<int>();
      double total_pv_current = inv0["pv_total_input_current"].get<double>() +
                                inv1["pv_total_input_current"].get<double>();
      total_pv_current = std::round(total_pv_current * 100.0) / 100.0;
      double total_pv_power =
          std::round((inv0["pv1_input_power"].get<double>() + inv0["pv2_input_power"].get<double>() +
                      inv1["pv1_input_power"].get<double>() + inv1["pv2_input_power"].get<double>()) *
                     100.0) /
          100.0;
      int system_status = (hasAnyAlarm(inv0) || hasAnyAlarm(inv1)) ? 1 : 0;

      int total_ac_apparent = inv0["ac_output_apparent_power"].get<int>() +
                              inv1["ac_output_apparent_power"].get<int>();
      int total_ac_active = inv0["ac_output_active_power"].get<int>() +
                            inv1["ac_output_active_power"].get<int>();
      int total_ac_reactive = total_ac_apparent - total_ac_active;
      int avg_battery_soc =
          (inv0["battery_soc"].get<int>() + inv1["battery_soc"].get<int>()) / 2;
      double avg_grid_voltage =
          std::round((inv0["grid_input_voltage"].get<double>() +
                      inv1["grid_input_voltage"].get<double>()) *
                     100.0) /
          100.0;
      double avg_grid_frequency =
          std::round((inv0["grid_input_frequency"].get<double>() +
                      inv1["grid_input_frequency"].get<double>()) *
                     100.0) /
          100.0;

      // === JSON DE TOTALES ===
      json totals;
      totals["total_system_battery_charging_current"] = total_charging;
      totals["total_system_battery_discharge_current"] = total_discharge;
      totals["total_system_battery_voltage"] = avg_battery_voltage;
      totals["total_system_load_percentage"] = total_system_load_percentage;
      totals["total_system_pv_input_current"] = total_pv_current;
      totals["total_system_pv_input_power"] = total_pv_power;
      totals["system_general_status"] = system_status;
      totals["total_system_ac_output_apparent_power"] = total_ac_apparent;
      totals["total_system_ac_output_active_power"] = total_ac_active;
      totals["total_system_ac_output_reactive_power"] = total_ac_reactive;
      totals["total_system_battery_soc"] = avg_battery_soc;
      totals["total_system_grid_input_voltage"] = avg_grid_voltage;
      totals["total_system_grid_input_frequency"] = avg_grid_frequency;

      // 🔸 NUEVOS CAMPOS EN TOTALES
      totals["total_system_battery_real_charge"] = total_system_battery_real_charge;
      totals["total_system_battery_power"] = total_system_battery_power;
      totals["total_system_estimate_ac_input_power"] = total_system_estimate_ac_input_power;

      // 🔍 [OPCIONAL] Log de totales
      logMessage("DEBUG total_system_battery_real_charge: " + std::to_string(total_system_battery_real_charge));

      // Publicar
      publishMQTT(mosq, TOPIC_INV0, inv0);
      publishMQTT(mosq, TOPIC_INV1, inv1);
      publishMQTT(mosq, TOPIC_TOTALS, totals);

    } catch (const std::exception &e) {
      logMessage("⚠️ Error en ciclo: " + std::string(e.what()));
    }

    close(sockfd);
    mosquitto_disconnect(mosq);
    std::this_thread::sleep_for(
        std::chrono::milliseconds(g_config.delay_between_cycles_ms));
  }

  mosquitto_destroy(mosq);
  mosquitto_lib_cleanup();
  logMessage("✅ Finalizado.");
  if (g_logFile.is_open())
    g_logFile.close();
  return 0;
}
