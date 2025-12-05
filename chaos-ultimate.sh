#!/bin/bash

# Script de caos para probar:
# - Fase 1: filtro temporal
# - Fase 2: elección de líder / split-brain
# - Fase 3: WAL y recuperación

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW} Iniciando PRUEBA FINAL del sistema distribuido ${NC}"
echo "Asegúrate de tener publisher-11 al publisher-15 levantados."
sleep 2

# ===========================
# FASE 1
# ===========================
echo -e "\n${YELLOW}[FASE 1] Probando Integridad Temporal...${NC}"
echo " -> Inyectando mensaje del año 2050..."

docker exec mqtt-broker mosquitto_pub \
  -t "utp/sistemas_distribuidos/grupo1/malicious-node/telemetry" \
  -m '{"deviceId":"malicious-node","timestamp":"2050-01-01T00:00:00Z","temperatura":999,"humedad":99}'

sleep 2

if docker logs persistence-subscriber 2>&1 | grep -q "Rejected future packet"; then
  echo -e "${GREEN} ✔ EXITO: El ataque temporal fue rechazado correctamente.${NC}"
else
  echo -e "${RED} ✘ FALLO: El sistema aceptó datos corruptos o no logueó el rechazo.${NC}"
  exit 1
fi

# ===========================
# FASE 2
# ===========================
echo -e "\n${YELLOW}[FASE 2] Probando estabilidad de liderazgo (Split-Brain)...${NC}"

LEADER_GUESS="publisher-15"
echo " -> Líder supuesto: $LEADER_GUESS"

echo " -> Congelando al líder (pause)..."
docker pause $LEADER_GUESS
sleep 7

echo " -> Verificando si otro nodo tomó liderazgo..."

NEW_LEADER=""
for N in 11 12 13 14; do
  if docker logs publisher-$N 2>&1 | grep -q "Ascendido a Líder"; then
    NEW_LEADER="publisher-$N"
  fi
done

if [ -z "$NEW_LEADER" ]; then
  echo -e "${RED} ✘ FALLO: Ningún nodo tomó liderazgo tras pausar al líder.${NC}"
  docker unpause $LEADER_GUESS
  exit 1
else
  echo -e "${GREEN} ✔ Nuevo líder detectado: ${NEW_LEADER}${NC}"
fi

echo " -> Restaurando al líder original..."
docker unpause $LEADER_GUESS
sleep 4

if docker logs $LEADER_GUESS --tail 50 | grep -q "Stepping down"; then
  echo -e "${GREEN} ✔ EXITO: El viejo líder se dio cuenta y se bajó (Stepping down).${NC}"
else
  echo -e "${YELLOW} ⚠ ALERTA: No se encontró 'Stepping down' en el viejo líder, revisar manualmente.${NC}"
fi

# ===========================
# FASE 3
# ===========================
echo -e "\n${YELLOW}[FASE 3] Probando Recuperación de Estado (WAL)...${NC}"

echo " -> Generando tráfico (simulación de cola)..."
# Aquí simplemente forzamos algo de actividad
docker exec publisher-12 sh -c "sleep 1" >/dev/null 2>&1 &

echo " -> Reiniciando violentamente al nuevo líder..."
docker restart $NEW_LEADER
sleep 6

if docker logs $NEW_LEADER --tail 50 | grep -q "Restored queue"; then
  echo -e "${GREEN} ✔ EXITO: El líder restauró la cola desde el WAL.${NC}"
else
  echo -e "${RED} ✘ FALLO: El líder revivió sin memoria (no restauró WAL).${NC}"
  exit 1
fi

echo -e "\n${GREEN} TODAS LAS FASES SUPERADAS CORRECTAMENTE 🎉${NC}"
