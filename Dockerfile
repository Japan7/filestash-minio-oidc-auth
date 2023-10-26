FROM lukechannings/deno:latest

WORKDIR /app

COPY main.ts deno.lock .env.example .env.defaults ./
RUN deno cache main.ts

CMD ["run", "--allow-read", "--allow-env", "--allow-net", "main.ts"]
EXPOSE 8000
