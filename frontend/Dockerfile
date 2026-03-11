# ─── Multi-stage Frontend Dockerfile ──────────────────────────────────────────
# Stage 1: deps        — install node_modules (cached layer)
# Stage 2: development — Vite dev server with HMR
# Stage 3: builder     — npm run build (production bundle)
# Stage 4: production  — nginx serving /dist (tiny final image)
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine AS deps

WORKDIR /app

# Only copy package files first — maximises cache hit rate
COPY package.json package-lock.json ./
RUN npm ci --prefer-offline

# ─── Development stage (hot reload) ───────────────────────────────────────────
FROM deps AS development

COPY . .

EXPOSE 5173
EXPOSE 24678

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

# ─── Builder stage (production bundle) ────────────────────────────────────────
FROM deps AS builder

ARG VITE_API_URL=/api
ARG VITE_USE_MOCK=false

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_USE_MOCK=${VITE_USE_MOCK}

COPY . .
RUN npm run build

# ─── Production stage (static nginx) ──────────────────────────────────────────
FROM nginx:1.25-alpine AS production

# Security: remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Serve the Vite build output
COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx config for SPA (React Router): route all 404s to index.html
COPY nginx-spa.conf /etc/nginx/conf.d/careiq.conf

# Health check
RUN echo "OK" > /usr/share/nginx/html/health

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
