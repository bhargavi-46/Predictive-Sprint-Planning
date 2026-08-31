FROM node:22-alpine

WORKDIR /app

# Copy manifests first so the dependency layer is cached across code changes.
COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

EXPOSE 4000
CMD ["node", "src/index.js"]
