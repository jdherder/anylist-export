FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
# tzdata lets the TZ variable work for the schedule and log times
RUN apk add --no-cache tzdata
WORKDIR /app
ENV NODE_ENV=production \
    OUTPUT_DIR=/data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
VOLUME ["/data"]
CMD ["node", "dist/index.js"]
