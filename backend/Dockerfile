# 1️⃣ Base image
FROM node:20-slim

# 2️⃣ Working directory
WORKDIR /app

# 3️⃣ Copy manifest files
COPY package*.json ./

# 4️⃣ Install production deps
RUN npm ci --omit=dev

# 5️⃣ Copy source code
COPY . .

# 6️⃣ Expose the listening port
EXPOSE 5000

# 7️⃣ Startup command
CMD ["node", "server.js"]
