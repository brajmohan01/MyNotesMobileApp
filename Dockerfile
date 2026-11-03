FROM node:24-bookworm-slim

WORKDIR /app

RUN npm install -g swytchcode@2.25.1

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

# Swytchcode configuration and Google Drive integration
COPY .swytchcode/ ./.swytchcode/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
