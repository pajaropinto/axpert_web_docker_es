# Etapa 1: Compilación
FROM alpine:latest AS builder

RUN apk add --no-cache \
    g++ \
    make \
    libc-dev \
    linux-headers \
    mosquitto-dev \
    git

# Instalar nlohmann/json
RUN git clone --depth 1 --branch v3.11.3 https://github.com/nlohmann/json.git /tmp/nlohmann && \
    mkdir -p /usr/include/nlohmann && \
    cp /tmp/nlohmann/single_include/nlohmann/json.hpp /usr/include/nlohmann/ && \
    rm -rf /tmp/nlohmann

WORKDIR /app
COPY src/main.cpp .
RUN mkdir -p config log

RUN g++ -std=c++17 -O2 -static-libgcc -static-libstdc++ \
    -I/usr/include/nlohmann main.cpp -lmosquitto -o axpert_monitor

# Etapa 2: Runtime
FROM alpine:latest

RUN apk add --no-cache \
    mosquitto-clients \
    nano \
    iputils \
    bind-tools \
    curl \
    python3

WORKDIR /app
COPY --from=builder /app/axpert_monitor .
COPY config/ ./config/
RUN mkdir -p log www

COPY www/ ./www/
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 60606

CMD ["/app/entrypoint.sh"]
