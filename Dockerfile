FROM node:20.19.4-alpine3.22@sha256:df02558528d3d3d0d621f112e232611aecfee7cbc654f6b375765f72bb262799

WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force
COPY . ./
RUN npm run build && npm test \
    && chmod -R a+rX /workspace

ENV HOME=/tmp NO_UPDATE_NOTIFIER=1
USER node
CMD ["npm", "test"]
