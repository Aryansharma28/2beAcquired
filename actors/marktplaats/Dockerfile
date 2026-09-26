# Playwright + Google Chrome base image. The tag pins the Playwright version, which must
# match "playwright" in package.json (checked by check-playwright-version.mjs below).
FROM apify/actor-node-playwright-chrome:24-1.61.1 AS builder

COPY --chown=myuser:myuser package*.json Dockerfile ./
RUN node check-playwright-version.mjs
RUN npm install --include=dev --audit=false
COPY --chown=myuser:myuser . ./
RUN npm run build

FROM apify/actor-node-playwright-chrome:24-1.61.1

COPY --chown=myuser:myuser package*.json ./
RUN npm --quiet set progress=false \
    && npm install --omit=dev --omit=optional --audit=false \
    && echo "Node.js version:" && node --version \
    && rm -r ~/.npm     && npx cloakbrowser install

COPY --from=builder --chown=myuser:myuser /home/myuser/dist ./dist
COPY --chown=myuser:myuser . ./

CMD ["node", "dist/main.js"]
