FROM nginx:1.25-alpine

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our config
COPY nginx.conf /etc/nginx/nginx.conf
COPY careiq-http.conf /etc/nginx/conf.d/careiq-http.conf

# Test config at build time
RUN nginx -t

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
