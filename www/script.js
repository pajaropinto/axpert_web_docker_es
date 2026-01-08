// --- Pestaña 1: datos MQTT formateados ---
let mqttClient = null;

// ✅ Crear un contenedor global para el indicador MQTT
function createMqttStatusIndicator() {
    // Buscar el primer contenedor de pestaña
    const firstTabContent = document.querySelector('.tabcontent');
    if (!firstTabContent) return;

    // Si ya existe, no crearlo de nuevo
    if (document.getElementById('mqtt-status-indicator')) return;

    const indicator = document.createElement('div');
    indicator.id = 'mqtt-status-indicator';
    indicator.style.cssText = `
        text-align: center;
        padding: 10px;
        margin: 10px auto;
        font-weight: bold;
        background-color: #f0f8ff;
        border-radius: 8px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        width: fit-content;
        min-width: 300px;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    indicator.innerHTML = `
        <span>Estado de conexión MQTT:</span>
        <span id="mqtt-status-dot" style="
            display: inline-block;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background-color: red;
            margin: 0 10px;
        "></span>
        <span id="mqtt-status-text">Desconectado</span>
    `;
    // Insertar justo antes de la primera pestaña
    firstTabContent.parentNode.insertBefore(indicator, firstTabContent);
}

function updateMqttStatus(state) {
    const dot = document.getElementById('mqtt-status-dot');
    const text = document.getElementById('mqtt-status-text');
    if (!dot || !text) return;

    switch (state) {
        case 'connected':
            dot.style.backgroundColor = '#4CAF50'; // verde
            text.textContent = 'Conectado';
            break;
        case 'reconnecting':
            dot.style.backgroundColor = '#FF9800'; // ámbar
            text.textContent = 'Reconectando...';
            break;
        case 'disconnected':
            dot.style.backgroundColor = '#f44336'; // rojo
            text.textContent = 'Desconectado';
            break;
        default:
            dot.style.backgroundColor = '#9E9E9E'; // gris
            text.textContent = 'Desconocido';
    }
}

function formatDataForDisplay(data) {
    // Detectar si es el JSON de "Totales"
    const isTotals = data.hasOwnProperty("total_system_load_percentage");

    if (isTotals) {
        // === TOTALES: agrupación y orden solicitados ===
        const groups = {
            "⚡ Energía": {},
            "🔌 Grid": {},
            "☀️ PV": {},
            "🔋 Baterías": {},
            "ℹ️ Estados": {}
        };

        // ⚡ Energía
        if (data.hasOwnProperty("total_system_ac_output_apparent_power"))
            groups["⚡ Energía"]["Total potencia aparente (VA)"] = data.total_system_ac_output_apparent_power;
        if (data.hasOwnProperty("total_system_ac_output_active_power"))
            groups["⚡ Energía"]["Total potencia activa (W)"] = data.total_system_ac_output_active_power;
        if (data.hasOwnProperty("total_system_ac_output_reactive_power"))
            groups["⚡ Energía"]["Total potencia reactiva (VAR)"] = data.total_system_ac_output_reactive_power;
        if (data.hasOwnProperty("total_system_load_percentage"))
            groups["⚡ Energía"]["Total System Load Percentage (%)"] = data.total_system_load_percentage;

        // 🔌 Grid
        if (data.hasOwnProperty("total_system_grid_input_voltage"))
            groups["🔌 Grid"]["Total System Grid Input Voltage (V)"] = data.total_system_grid_input_voltage;
        if (data.hasOwnProperty("total_system_grid_input_frequency"))
            groups["🔌 Grid"]["Total System Grid Input Frequency (Hz)"] = data.total_system_grid_input_frequency;
        // 🔸 NUEVO: Potencia estimada total entrada AC → con nombre claro
        if (data.hasOwnProperty("total_system_estimate_ac_input_power"))
            groups["🔌 Grid"]["Potencia estimada de carga (W)"] = data.total_system_estimate_ac_input_power;

        // ☀️ PV
        if (data.hasOwnProperty("total_system_pv_input_current"))
            groups["☀️ PV"]["Corriente total PV (A)"] = data.total_system_pv_input_current;
        if (data.hasOwnProperty("total_system_pv_input_power"))
            groups["☀️ PV"]["Potencia total PV (W)"] = data.total_system_pv_input_power;

        // 🔋 Baterías
        if (data.hasOwnProperty("total_system_battery_voltage"))
            groups["🔋 Baterías"]["Voltaje promedio batería (V)"] = data.total_system_battery_voltage;
        if (data.hasOwnProperty("total_system_battery_soc"))
            groups["🔋 Baterías"]["Estado de carga promedio (%)"] = data.total_system_battery_soc;
        if (data.hasOwnProperty("total_system_battery_charging_current"))
            groups["🔋 Baterías"]["Carga total batería (A)"] = data.total_system_battery_charging_current;
        if (data.hasOwnProperty("total_system_battery_discharge_current"))
            groups["🔋 Baterías"]["Descarga total batería (A)"] = data.total_system_battery_discharge_current;
        // 🔸 NUEVOS: Batería neta → con nombres claros
        if (data.hasOwnProperty("total_system_battery_real_charge"))
            groups["🔋 Baterías"]["Corriente real de carga (A)"] = data.total_system_battery_real_charge;
        if (data.hasOwnProperty("total_system_battery_power"))
            groups["🔋 Baterías"]["Potencia real de carga (W)"] = data.total_system_battery_power;

        // ℹ️ Estados
        if (data.hasOwnProperty("system_general_status"))
            groups["ℹ️ Estados"]["System General Status"] = data.system_general_status;

        return groups;
    } else {
        // === INVERSORES: agrupación y orden solicitados ===
        const groups = {
            "ℹ️ Inversor": {},
            "💻 Salida AC": {},
            "🔌 Red (Grid)": {},
            "☀️ PV (Solar)": {},
            "🔋 Batería": {},
            "ℹ️ Estados": {},
            "⚠️ Alarmas": {},
            "⚙️ Configuración": {},
            " Otros": {}
        };

        const fieldMap = {
            // ℹ️ Inversor
            "inverter_id": ["ℹ️ Inversor", "ID inversor"],
            "serial_number": ["ℹ️ Inversor", "Número de serie"],

            // 💻 Salida AC
            "ac_output_voltage": ["💻 Salida AC", "Voltaje salida (V)"],
            "ac_output_apparent_power": ["💻 Salida AC", "Potencia aparente (VA)"],
            "ac_output_active_power": ["💻 Salida AC", "Potencia activa (W)"],
            "ac_output_reactive_power": ["💻 Salida AC", "Potencia reactiva (VAR)"],
            "ac_output_frequency": ["💻 Salida AC", "Frecuencia salida (Hz)"],
            "load_percentage": ["💻 Salida AC", "Carga (%)"],

            // 🔌 Red (Grid)
            "grid_input_voltage": ["🔌 Red (Grid)", "Voltaje de entrada (V)"],
            "grid_input_frequency": ["🔌 Red (Grid)", "Frecuencia de entrada (Hz)"],
            // 🔸 CORREGIDO: en "Red (Grid)" con nombre claro
            "ac_input_power_estimate": ["🔌 Red (Grid)", "Potencia estimada de carga (W)"],

            // ☀️ PV (Solar)
            "pv1_input_voltaje": ["☀️ PV (Solar)", "PV1 voltaje (V)"],
            "pv1_input_current": ["☀️ PV (Solar)", "PV1 corriente (A)"],
            "pv1_input_power": ["☀️ PV (Solar)", "PV1 potencia (W)"],
            "pv2_input_voltaje": ["☀️ PV (Solar)", "PV2 voltaje (V)"],
            "pv2_input_current": ["☀️ PV (Solar)", "PV2 corriente (A)"],
            "pv2_input_power": ["☀️ PV (Solar)", "PV2 potencia (W)"],
            "pv_total_input_current": ["☀️ PV (Solar)", "Corriente total PV (A)"],
            // 🔸 ELIMINADOS: campos redundantes
            // "total_inv_pv_input_current": ["☀️ PV (Solar)", "Corriente PV total (A)"],
            // "total_inv_pv_input_power": ["☀️ PV (Solar)", "Potencia PV total (W)"],

            // 🔋 Batería
            "battery_voltage": ["🔋 Batería", "Voltaje (V)"],
            "battery_charging_current": ["🔋 Batería", "Corriente de carga (A)"],
            "battery_discharge_current": ["🔋 Batería", "Corriente de descarga (A)"],
            "battery_soc": ["🔋 Batería", "Estado de carga (%)"],
            // 🔸 ELIMINADO: no se incluye "battery_total_all_inputs_charging_current"
            // 🔸 CORREGIDO: en "Batería" con nombres claros
            "battery_real_charge_current": ["🔋 Batería", "Corriente real de carga (A)"],
            "battery_real_power": ["🔋 Batería", "Potencia real de carga (W)"],

            // ℹ️ Estados
            "status_ac_charging": ["ℹ️ Estados", "Carga AC activa"],
            "status_configuration": ["ℹ️ Estados", "Configuración activa"],
            "status_load_on": ["ℹ️ Estados", "Carga conectada"],
            "status_solar_charging": ["ℹ️ Estados", "Carga solar activa"],
            "work_mode": ["ℹ️ Estados", "Modo de trabajo"],

            // ⚠️ Alarmas
            "01_fan_locked": ["⚠️ Alarmas", "Ventilador bloqueado"],
            "02_over_temperature": ["⚠️ Alarmas", "Sobrecalentamiento"],
            "03_battery_voltage_high": ["⚠️ Alarmas", "Batería sobretensión"],
            "04_battery_voltage_low": ["⚠️ Alarmas", "Batería subtensión"],
            "05_output_short_circuited": ["⚠️ Alarmas", "Cortocircuito salida"],
            "06_output_voltage_high": ["⚠️ Alarmas", "Salida sobretensión"],
            "07_overload_timeout": ["⚠️ Alarmas", "Sobrecarga"],
            "08_bus_voltage_high": ["⚠️ Alarmas", "Bus DC alto"],
            "09_bus_soft_start_failed": ["⚠️ Alarmas", "Error arranque suave"],
            "10_pv_over_current": ["⚠️ Alarmas", "Sobrecorriente PV"],
            "11_pv_over_voltage": ["⚠️ Alarmas", "Sobretensión PV"],
            "12_dcdc_over_current": ["⚠️ Alarmas", "Sobrecorriente DC-DC"],
            "13_battery_discharge_over_current": ["⚠️ Alarmas", "Descarga excesiva batería"],
            "51_over_current": ["⚠️ Alarmas", "Sobrecorriente salida"],
            "52_bus_voltage_low": ["⚠️ Alarmas", "Bus DC bajo"],
            "53_inverter_soft_start_failed": ["⚠️ Alarmas", "Error arranque inversor"],
            "55_over_dc_voltage_in_ac_output": ["⚠️ Alarmas", "DC en salida AC"],
            "57_current_sensor_failed": ["⚠️ Alarmas", "Sensor de corriente fallido"],
            "58_output_voltage_low": ["⚠️ Alarmas", "Salida subtensión"],
            "60_power_feedback_protection": ["⚠️ Alarmas", "Protección realimentación"],
            "71_firmware_version_inconsistent": ["⚠️ Alarmas", "Firmware inconsistente"],
            "72_current_sharing_fault": ["⚠️ Alarmas", "Error reparto corriente"],
            "80_can_fault": ["⚠️ Alarmas", "Error CAN"],
            "81_host_loss": ["⚠️ Alarmas", "Pérdida host"],
            "82_synchronization_loss": ["⚠️ Alarmas", "Pérdida sincronización"],
            "83_battery_voltage_diff_parallel": ["⚠️ Alarmas", "Diferencia batería en paralelo"],
            "84_ac_input_diff_parallel": ["⚠️ Alarmas", "Diferencia entrada AC en paralelo"],
            "85_ac_output_unbalance": ["⚠️ Alarmas", "Desequilibrio salida AC"],
            "86_ac_output_mode_diff": ["⚠️ Alarmas", "Modo salida AC diferente"],
            "alarm_battery_health": ["⚠️ Alarmas", "Batería en mal estado"],
            "alarm_line_loss": ["⚠️ Alarmas", "Pérdida de red"],
            "alarm_scc_loss": ["⚠️ Alarmas", "Pérdida comunicación SCC"],

            // ⚙️ Configuración
            "charger_source_priority": ["⚙️ Configuración", "Prioridad cargador"],
            "config_max_ac_charger_current": ["⚙️ Configuración", "Carga AC máx. (A)"],
            "config_max_charge_range": ["⚙️ Configuración", "Rango carga máx."],
            "config_max_charger_current": ["⚙️ Configuración", "Carga máx. batería (A)"],
            "output_mode": ["⚙️ Configuración", "Modo salida"],
            "parallel_configuration": ["⚙️ Configuración", "Config. paralelo"]
        };

        for (const [key, value] of Object.entries(data)) {
            if (key in fieldMap) {
                const [group, label] = fieldMap[key];
                groups[group][label] = value;
            }
        }

        const processedKeys = new Set(Object.keys(fieldMap));
        for (const [key, value] of Object.entries(data)) {
            if (processedKeys.has(key) || typeof value === 'object' || value === null) continue;
            let label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            if (key.includes('voltage') || key.includes('voltaje')) label += ' (V)';
            else if (key.includes('current')) label += ' (A)';
            else if (key.includes('power') && !key.includes('apparent')) label += ' (W)';
            else if (key.includes('apparent_power')) label += ' (VA)';
            else if (key.includes('frequency')) label += ' (Hz)';
            else if (key.includes('percentage') || key.includes('percentaje') || key.includes('soc')) label += ' (%)';
            groups[" Otros"][label] = value;
        }

        if (Object.keys(groups[" Otros"]).length === 0) {
            delete groups[" Otros"];
        }

        return groups;
    }
}

function renderGroupedData(containerId, data) {
    const groups = formatDataForDisplay(data);
    let html = '';

    for (const [groupName, fields] of Object.entries(groups)) {
        if (Object.keys(fields).length === 0) continue;
        html += `<h4>${groupName}</h4><div class="group-content">`;
        for (const [label, value] of Object.entries(fields)) {
            let displayValue = value;
            if (typeof value === 'number' && !Number.isInteger(value)) {
                displayValue = parseFloat(value.toFixed(2));
            }
            html += `<div class="data-row"><span class="label">${label}:</span> <span class="value">${displayValue}</span></div>`;
        }
        html += `</div>`;
    }

    document.getElementById(containerId).innerHTML = html || '<em>Sin datos</em>';
}

function loadMqttConfigAndConnect() {
    fetch('/config/app_config.json')
        .then(res => res.json())
        .then(config => {
            const broker = config.mqtt_broker_ip;
            const port = config.mqtt_broker_ws_port || 9001;
            const user = config.mqtt_user || '';
            const password = config.mqtt_password || '';

            if (mqttClient) {
                mqttClient.end();
            }

            mqttClient = mqtt.connect(`ws://${broker}:${port}`, {
                username: user,
                password: password,
                clientId: 'web-client-' + Math.random().toString(16).substr(2, 8),
                reconnectPeriod: 3000,
                connectTimeout: 5000
            });

            mqttClient.on("connect", () => {
                console.log("✅ Conectado a MQTT vía WebSocket");
                updateMqttStatus('connected');
                mqttClient.subscribe("homeassistant/axpert/inv01");
                mqttClient.subscribe("homeassistant/axpert/inv02");
                mqttClient.subscribe("homeassistant/axpert/totales");
            });

            mqttClient.on("reconnect", () => {
                console.log("🟡 Reconectando a MQTT...");
                updateMqttStatus('reconnecting');
            });

            mqttClient.on("close", () => {
                console.log("🔴 Conexión MQTT cerrada");
                updateMqttStatus('disconnected');
            });

            mqttClient.on("error", (err) => {
                console.error("❌ Error MQTT:", err);
                updateMqttStatus('disconnected');
            });

            mqttClient.on("message", (topic, message) => {
                const data = JSON.parse(message.toString());
                if (topic === "homeassistant/axpert/inv01") {
                    renderGroupedData("inv1-data", data);
                } else if (topic === "homeassistant/axpert/inv02") {
                    renderGroupedData("inv2-data", data);
                } else if (topic === "homeassistant/axpert/totales") {
                    renderGroupedData("totals-data", data);
                }
            });
        })
        .catch(err => {
            console.error("❌ No se pudo cargar app_config.json:", err);
            document.getElementById("inv1-data").innerHTML = "Error al cargar configuración";
            updateMqttStatus('disconnected');
        });
}

// === Pestaña 2: Configuración de inversores ===

const configFieldNames = {
    "01": "01 - Prioridad fuente de energía",
    "03": "03 - Rango de voltaje de entrada AC",
    "06": "06 - Reinicio tras sobrecarga",
    "07": "07 - Reinicio tras sobretemperatura",
    "09": "09 - Frecuencia de salida",
    "11": "11 - Corriente máxima de carga desde grid",
    "16": "16 - Prioridad de carga de batería",
    "18": "18 - Alarma sonora",
    "19": "19 - Retorno automático a pantalla principal",
    "20": "20 - Luz de fondo de la pantalla",
    "22": "22 - Alarma por corte de red",
    "23": "23 - Bypass por sobrecarga",
    "25": "25 - Registro de fallos",
    "30": "30 - Activar ecualización",
    "41": "41 - Corriente máxima de descarga"
};

// Mapeo: código → { tipo, opciones }
const fieldTypes = {
    "01": { type: "select", options: { "USB": "00", "SUB": "01", "SBU": "02" } },
    "03": { type: "select", options: { "APL": "00", "UPS": "01" } },
    "06": { type: "select", options: { "Enable": "PEU", "Disable": "PDU" } },
    "07": { type: "select", options: { "Enable": "PEV", "Disable": "PDV" } },
    "09": { type: "select", options: { "50": "50", "60": "60" } },
    "11": { type: "number", decimals: 0 },
    "16": { type: "select", options: { "SOL": "00", "SNU": "01", "OSO": "02" } },
    "18": { type: "select", options: { "Enable": "PEA", "Disable": "PDA" } },
    "19": { type: "select", options: { "Enable": "PEK", "Disable": "PDK" } },
    "20": { type: "select", options: { "Enable": "PEX", "Disable": "PDX" } },
    "22": { type: "select", options: { "Enable": "PEY", "Disable": "PDY" } },
    "23": { type: "select", options: { "Enable": "PEB", "Disable": "PDB" } },
    "25": { type: "select", options: { "Enable": "PEZ", "Disable": "PDZ" } },
    "30": { type: "select", options: { "Enable": "1", "Disable": "0" } },
    "41": { type: "number", decimals: 0 }
};

// Lista de comandos "directos" (el valor del campo es el comando completo)
const directCommands = ["06", "07", "18", "19", "20", "22", "23", "25"];

// Lista de comandos silenciosos (sin ACK/NAK)
const silentCommands = ["PEU", "PDU", "PEV", "PDV", "PEA", "PDA", "PEK", "PDK", "PEX", "PDX", "PEY", "PDY", "PEB", "PDB", "PEZ", "PDZ"];

// ✅ Mostrar todos los campos desde el inicio (con botón "Enviar")
function initializeInverterConfig(containerId) {
    // Separar campos comunes y específicos
    const commonFields = ["01", "09"];
    const specificFields = Object.keys(configFieldNames).filter(k => !commonFields.includes(k)).sort((a, b) => parseInt(a) - parseInt(b));

    let html = '';

    // Grupo 1: Configuración específica
    for (const key of specificFields) {
        const label = configFieldNames[key];
        const inputId = `${containerId}-${key}`;
        const buttonId = `${containerId}-btn-${key}`;
        const fieldType = fieldTypes[key];

        if (fieldType && fieldType.type === "select") {
            html += `<div class="config-row">
        <label>${label}</label>
        <select id="${inputId}">`;
            for (const [text, value] of Object.entries(fieldType.options)) {
                html += `<option value="${value}">${text}</option>`;
            }
            html += `</select><button id="${buttonId}" class="send-btn">Enviar</button></div>`;
        } else {
            html += `<div class="config-row">
        <label>${label}</label>
        <input type="text" id="${inputId}" value="" />
        <button id="${buttonId}" class="send-btn">Enviar</button>
      </div>`;
        }
    }

    // Solo en inversor 1: Grupo 2 - Configuraciones comunes
    if (containerId === "inv01-config-fields") {
        html += `<h3>Configuraciones comunes</h3>`;
        for (const key of commonFields) {
            const label = configFieldNames[key];
            const inputId = `${containerId}-${key}`;
            const buttonId = `${containerId}-btn-${key}`;
            const fieldType = fieldTypes[key];

            if (fieldType && fieldType.type === "select") {
                html += `<div class="config-row">
          <label>${label}</label>
          <select id="${inputId}">`;
                for (const [text, value] of Object.entries(fieldType.options)) {
                    html += `<option value="${value}">${text}</option>`;
                }
                html += `</select><button id="${buttonId}" class="send-btn">Enviar</button></div>`;
            } else {
                html += `<div class="config-row">
          <label>${label}</label>
          <input type="text" id="${inputId}" value="" />
          <button id="${buttonId}" class="send-btn">Enviar</button>
        </div>`;
            }
        }
    }

    document.getElementById(containerId).innerHTML = html;

    // ✅ Asociar evento a cada botón "Enviar"
    setTimeout(() => {
        const allKeys = containerId === "inv01-config-fields"
            ? [...specificFields, ...commonFields]
            : specificFields;

        for (const key of allKeys) {
            const buttonId = `${containerId}-btn-${key}`;
            const button = document.getElementById(buttonId);
            if (button) {
                button.onclick = function () {
                    // ✅ Usar el containerId y key correctos
                    const inputId = `${containerId}-${key}`;
                    const input = document.getElementById(inputId);
                    let valueToSend = input ? (input.value || (input.options ? input.options[input.selectedIndex].value : "")) : "";
                    valueToSend = valueToSend.trim();

                    let message = "";
                    const valueStr = valueToSend.toString();

                    // ✅ Nueva lógica: comandos directos vs comandos con formato
                    if (directCommands.includes(key)) {
                        // El valor del campo es el comando completo
                        message = valueStr;
                    } else if (key === "01") {
                        // ✅ Solo el inversor 1 puede enviar POP (afecta a todo el sistema)
                        if (containerId === "inv01-config-fields") {
                            message = "POP" + valueStr.padStart(2, '0');
                        } else {
                            // ❌ Inversor 2: no enviar comando
                            alert("El comando POP solo se puede enviar desde el Inversor 1 (afecta a todo el sistema).");
                            return;
                        }
                    } else if (key === "03") {
                        message = "PGR" + valueStr.padStart(2, '0');
                    } else if (key === "09") {
                        message = "F" + valueStr.padStart(2, '0');
                    } else if (key === "11") {
                        message = "MUCHGC0" + valueStr.padStart(2, '0');
                    } else if (key === "16") {
                        let nn = "00";
                        if (valueStr === "00") nn = "03"; // SOL
                        else if (valueStr === "01") nn = "01"; // SNU
                        else if (valueStr === "02") nn = "02"; // OSO

                        let m = "1"; // afecta al inversor 2
                        if (containerId === "inv01-config-fields") {
                            m = "2"; // afecta al inversor 1
                        }
                        message = "PPCP" + m + nn;
                    } else if (key === "30") {
                        message = "PBEQE" + valueStr;
                    } else if (key === "41") {
                        message = "PBATMAXDISC" + valueStr.padStart(3, '0');
                    } else {
                        message = valueToSend;
                    }

                    // ✅ Obtener IP y puerto del inversor correspondiente
                    let ip, port;
                    if (containerId === "inv01-config-fields") {
                        ip = document.getElementById('inverter1_tcp_ip')?.value || '10.0.0.235';
                        port = parseInt(document.getElementById('inverter1_tcp_port')?.value) || 26;
                    } else if (containerId === "inv02-config-fields") {
                        ip = document.getElementById('inverter2_tcp_ip')?.value || '10.0.0.236';
                        port = parseInt(document.getElementById('inverter2_tcp_port')?.value) || 27;
                    } else {
                        // fallback
                        ip = '10.0.0.235';
                        port = 26;
                    }

                    tcp_serial_communication(message, ip, port, button);
                };
            }
        }
    }, 100);
}

// ✅ Cargar desde JSON (actualiza selects e inputs)
function loadInverterConfig(invId) {
    const url = invId === 'inv01' ? '/config/inv01_config.json' : '/config/inv02_config.json';
    const containerId = invId + '-config-fields';
    const statusId = 'status-' + invId;

    fetch(url)
        .then(res => {
            if (!res.ok) throw new Error('Archivo no encontrado');
            return res.json();
        })
        .then(data => {
            for (const key in configFieldNames) {
                // Solo cargar campos que existen en el contenedor
                if (invId === 'inv02' && ["01", "09"].includes(key)) continue;

                const inputId = `${containerId}-${key}`;
                const el = document.getElementById(inputId);
                if (el && data.hasOwnProperty(key)) {
                    if (el.tagName === "SELECT") {
                        // Buscar opción que tenga ese valor
                        for (const option of el.options) {
                            if (option.value === data[key]) {
                                option.selected = true;
                                break;
                            }
                        }
                    } else {
                        el.value = data[key];
                    }
                }
            }
            document.getElementById(statusId).textContent = "✅ Configuración cargada.";
            document.getElementById(statusId).style.color = "green";
        })
        .catch(err => {
            console.error("Error al cargar config:", err);
            document.getElementById(statusId).textContent = "❌ Error al cargar.";
            document.getElementById(statusId).style.color = "red";
        });
}

// ✅ Salvar: obtiene el valor real (value del select o input)
function saveInverterConfig(invId) {
    const url = invId === 'inv01' ? '/config/inv01_config.json' : '/config/inv02_config.json';
    const statusId = 'status-' + invId;
    const config = {};

    for (const key in configFieldNames) {
        if (configFieldNames.hasOwnProperty(key)) {
            // En inversor 2, no guardar campos comunes
            if (invId === 'inv02' && ["01", "09"].includes(key)) continue;

            const inputId = `${invId}-config-fields-${key}`;
            const el = document.getElementById(inputId);
            if (el) {
                config[key] = el.value;
            }
        }
    }

    fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config, null, 2)
    })
        .then(res => {
            if (res.ok) {
                document.getElementById(statusId).textContent = "✅ Guardado correctamente.";
                document.getElementById(statusId).style.color = "green";
            } else {
                throw new Error('HTTP ' + res.status);
            }
        })
        .catch(err => {
            console.error("Error al guardar config:", err);
            document.getElementById(statusId).textContent = "❌ Error al salvar.";
            document.getElementById(statusId).style.color = "red";
        });
}

// === Comunicación con el inversor vía TCP/Serial (a través del servidor) ===
async function tcp_serial_communication(command, ip, port, button) {
    try {
        const isSilent = silentCommands.includes(command);
        const originalText = button.textContent;

        const response = await fetch('/api/send-command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command, ip, port })
        });

        if (isSilent) {
            // Para comandos silenciosos, asumir éxito tras timeout
            setTimeout(() => {
                button.textContent = "Comando aplicado";
                button.style.backgroundColor = "#4CAF50";
                setTimeout(() => {
                    button.textContent = originalText;
                    button.style.backgroundColor = "";
                }, 1500);
            }, 1000);
        } else {
            const data = await response.json();
            const message = data.status;
            button.textContent = message;
            button.style.backgroundColor = message === "Comando aceptado" ? "#4CAF50" : "#f44336";
            setTimeout(() => {
                button.textContent = originalText;
                button.style.backgroundColor = "";
            }, 2000);
        }

    } catch (err) {
        console.error("Error al enviar comando:", err);
        button.textContent = "Error de red";
        setTimeout(() => button.textContent = "Enviar", 1500);
    }
}

// Inicializar Pestaña 2 al cargar
document.addEventListener('DOMContentLoaded', function () {
    createMqttStatusIndicator(); // ✅ Indicador visible sin index.html
    loadMqttConfigAndConnect();
    setInterval(loadMqttConfigAndConnect, 10000);

    initializeInverterConfig('inv01-config-fields');
    initializeInverterConfig('inv02-config-fields');
});

// --- Pestaña 3: Configuración (USANDO inverter1_tcp_ip) ---
function loadConfig() {
    fetch('/config/app_config.json')
        .then(res => res.json())
        .then(config => {
            document.getElementById('delay_between_inverters_ms').value = config.delay_between_inverters_ms || 1000;
            document.getElementById('inverter1_tcp_ip').value = config.inverter1_tcp_ip || '10.0.0.235';
            document.getElementById('inverter1_tcp_port').value = config.inverter1_tcp_port || 26;
            document.getElementById('inverter2_tcp_ip').value = config.inverter2_tcp_ip || '10.0.0.236';
            document.getElementById('inverter2_tcp_port').value = config.inverter2_tcp_port || 27;
            document.getElementById('mqtt_broker_ip').value = config.mqtt_broker_ip || '10.0.0.250';
            document.getElementById('mqtt_broker_port').value = config.mqtt_broker_port || 1883;
            document.getElementById('mqtt_broker_ws_port').value = config.mqtt_broker_ws_port || 9001;
            document.getElementById('mqtt_user').value = config.mqtt_user || '';
            document.getElementById('mqtt_password').value = config.mqtt_password || '';
            setStatus("✅ Configuración cargada desde el archivo.", "success");
        })
        .catch(err => {
            console.error("Error al cargar config:", err);
            setStatus("❌ Error al cargar la configuración.", "error");
        });
}

function saveConfig() {
    const config = {
        delay_between_inverters_ms: parseInt(document.getElementById('delay_between_inverters_ms').value) || 1000,
        inverter1_tcp_ip: document.getElementById('inverter1_tcp_ip').value.trim(),
        inverter1_tcp_port: parseInt(document.getElementById('inverter1_tcp_port').value) || 26,
        inverter2_tcp_ip: document.getElementById('inverter2_tcp_ip').value.trim(),
        inverter2_tcp_port: parseInt(document.getElementById('inverter2_tcp_port').value) || 27,
        mqtt_broker_ip: document.getElementById('mqtt_broker_ip').value.trim(),
        mqtt_broker_port: parseInt(document.getElementById('mqtt_broker_port').value) || 1883,
        mqtt_broker_ws_port: parseInt(document.getElementById('mqtt_broker_ws_port').value) || 9001,
        mqtt_user: document.getElementById('mqtt_user').value.trim(),
        mqtt_password: document.getElementById('mqtt_password').value
    };

    fetch('/config/app_config.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config, null, 2)
    })
        .then(res => {
            if (res.ok) {
                setStatus("✅ Configuración guardada correctamente.", "success");
            } else {
                throw new Error('Error ' + res.status);
            }
        })
        .catch(err => {
            console.error("Error al guardar config:", err);
            setStatus("❌ Error al guardar la configuración.", "error");
        });
}

function setStatus(message, type) {
    const statusEl = document.getElementById('config-status');
    statusEl.textContent = message;
    statusEl.style.color = type === 'error' ? 'red' : 'green';
}

function openTab(evt, tabName) {
    const tabs = document.getElementsByClassName("tabcontent");
    for (let i = 0; i < tabs.length; i++) {
        tabs[i].style.display = "none";
    }
    document.getElementById(tabName).style.display = "block";

    const tablinks = document.getElementsByClassName("tablink");
    for (let i = 0; i < tablinks.length; i++) {
        tablinks[i].classList.remove("active");
    }
    evt.currentTarget.classList.add("active");
}
