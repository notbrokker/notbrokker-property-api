# Usa la imagen oficial de Playwright con todos los navegadores y dependencias necesarias
FROM mcr.microsoft.com/playwright:v1.54.0-jammy

# Crea carpeta de trabajo
WORKDIR /app

# Copia todo el código
COPY . .

# Instala dependencias
RUN yarn install

# Asegura que Playwright descargue los navegadores con dependencias
RUN yarn playwright install --with-deps

# Expone el puerto que Render usará
EXPOSE 10000

# Comando para iniciar el servidor
CMD ["node", "src/server.js"]
