FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
# No BuildKit cache mount on purpose: the legacy builder (docker without buildx, as on the
# owner's machine) rejects --mount. Layer caching on package*.json covers the common case.
RUN npm ci --no-audit --no-fund

COPY . .
# Precompress everything (brotli 11 + gzip 9). Generated JSON keeps only .br/.gz: nginx serves
# them with brotli_static / gzip_static always and gunzips for the rare client without gzip.
RUN npm run build && node scripts/precompress.mjs dist --drop-raw generated

# ngx_brotli is not shipped with the official nginx images; build just the static module against
# the exact nginx version of the runtime image (--with-compat keeps it loadable there).
FROM nginx:1.30-alpine-slim AS brotli

ARG NGX_BROTLI_COMMIT=53e0fb55f250f48fe80c0ddbf6c0f7103cdbaae1

RUN apk add --no-cache build-base git linux-headers pcre2-dev zlib-dev openssl-dev \
   && mkdir -p /src && cd /src \
   && wget -qO- "https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz" | tar -xz \
   && git clone --quiet https://github.com/google/ngx_brotli.git \
   && git -C ngx_brotli checkout --quiet "${NGX_BROTLI_COMMIT}" \
   && cd "/src/nginx-${NGINX_VERSION}" \
   && ./configure --with-compat --add-dynamic-module=/src/ngx_brotli/static \
   && make modules \
   && cp objs/ngx_http_brotli_static_module.so /tmp/

FROM nginx:1.30-alpine-slim AS runtime

COPY --from=brotli /tmp/ngx_http_brotli_static_module.so /usr/lib/nginx/modules/
RUN sed -i '1i load_module modules/ngx_http_brotli_static_module.so;' /etc/nginx/nginx.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Traefik only routes to healthy containers: probe quickly at startup so a deploy is not
# followed by ~30-60 s of Traefik 404s while the first 30 s interval elapses.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s --start-interval=1s \
  CMD wget -qO- http://127.0.0.1/ > /dev/null || exit 1
