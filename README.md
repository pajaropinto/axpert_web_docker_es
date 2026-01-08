# Axpert Web Docker (ES)

Monitorización y control avanzado para **inversores Axpert / Voltronic / MPPSolar** en configuración paralela, con interfaz web, MQTT y soporte Docker.

✅ **Características principales**:
- Lectura en tiempo real de **dos inversores en paralelo** mediante protocolo `QPGS`.
- Cálculo avanzado de:
  - **Corriente neta de batería** (carga - descarga).
  - **Potencia real de batería** (V × I neto).
  - **Potencia estimada de carga desde la red**.
- Interfaz web moderna con **MQTT + WebSocket**.
- Control remoto de parámetros del inversor (modo prioridad, alarma, carga, etc.).
- Totalmente **Dockerizado** (Alpine Linux + C++ + Python).
- Logs rotativos y configuración dinámica.

---

## 📦 Uso con Docker

### 1. Crear directorio de configuración

```bash
mkdir -p /ruta/a/config
cp config/app_config.json.example /ruta/a/config/app_config.json
cp config/inv01_config.json.example /ruta/a/config/inv01_config.json
cp config/inv02_config.json.example /ruta/a/config/inv02_config.json
