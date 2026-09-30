FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts steiger.config.ts index.html ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM nginxinc/nginx-unprivileged:1-alpine
ENV API_UPSTREAM=http://backend:3000
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
USER nginx
