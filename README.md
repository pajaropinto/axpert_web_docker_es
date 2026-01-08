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

🔒 Importante: Edita los archivos JSON para configurar tus IPs, puertos, credenciales MQTT, etc.

2. Ejecutar con Docker
bash
123456
docker run -d \
  --name axpert-monitor \
  --restart unless-stopped \
  -p 60606:60606 \
  -v /ruta/a/config:/app/config \
  pajaropinto/axpert-monitor:1.2

3. Acceder a la interfaz web
Abre en tu navegador:
👉 http://[tu-servidor]:60606

🛠️ Requisitos
2 inversores Axpert en modo paralelo (firmware compatible).
2 adaptadores TCP/Serial (o 1 adaptador que soporte comunicación con ambos).
Broker MQTT (ej. Mosquitto) accesible desde el contenedor.
Docker instalado en el servidor.

📁 Estructura del proyecto

.
├── src/                 # Código fuente en C++
├── www/                 # Interfaz web (HTML, JS, CSS)
├── config/              # Archivos de configuración (ejemplos incluidos)
├── Dockerfile           # Definición de la imagen Docker
├── entrypoint.sh        # Punto de entrada del contenedor
├── README.md            # Este archivo
└── .gitignore           # Archivos ignorados por Git

🐳 Imagen Docker
Disponible en Docker Hub:
🔗 pajaropinto/axpert-monitor

Etiquetas:

1.2 → Versión estable actual.
latest → Última versión.
