FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json ./
COPY prisma ./prisma

RUN npm install

COPY . .

RUN npm run build

ENV NODE_ENV=production
ENV PORT=10000

EXPOSE 10000

CMD ["npm", "start"]
