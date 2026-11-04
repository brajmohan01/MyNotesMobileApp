FROM node:24-bookworm-slim

WORKDIR /app

RUN mkdir -p /var/data

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g swytchcode@2.25.1

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

# Swytchcode configuration and Google Drive integration
COPY .swytchcode/ ./.swytchcode/

ENV NODE_ENV=production
ENV PORT=3000
ENV HOME=/var/data

EXPOSE 3000

CMD ["sh", "-c", "swytchcode bootstrap && exec npm start"]
