#!/bin/sh
# Iniciar app C++ en segundo plano
./axpert_monitor &

# Iniciar servidor web personalizado
cd /app/www
python3 server.py
