import fs from "node:fs";
import path from "node:path";
import { TelegramClient } from "telegram";
import { Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

function loadSession(sessionPath: string) {
  if (fs.existsSync(sessionPath)) return fs.readFileSync(sessionPath, "utf8");
  return "";
}
function saveSession(sessionPath: string, session: string) {
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(sessionPath, session, "utf8");
}

// Первый запуск попросит код (и 2FA пароль, если есть). Потом сессия сохранится.
export async function getBankClient() {
  const apiId = Number(process.env.TG_API_ID);
  const apiHash = process.env.TG_API_HASH!;
  const phone = process.env.TG_PHONE!;
  const sessionPath = process.env.TG_SESSION_PATH || "./session/bank.session";

  if (!apiId || !apiHash || !phone) {
  throw new Error("TG env not set (TG_API_ID / TG_API_HASH / TG_PHONE)");
}

  const stringSession = new StringSession(loadSession(sessionPath));
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => phone,
    phoneCode: async () => {
      process.stdout.write("Код из Telegram для аккаунта Банк: ");
      return await new Promise<string>((resolve) => {
        process.stdin.once("data", (d) => resolve(String(d).trim()));
      });
    },
    password: async () => {
      process.stdout.write("2FA пароль (если есть): ");
      return await new Promise<string>((resolve) => {
        process.stdin.once("data", (d) => resolve(String(d).trim()));
      });
    },
    onError: (err) => console.error("TG start error:", err),
  });

  saveSession(sessionPath, client.session.save());
  return client;
}

// Список подарков Банка (коллекционные)
export async function getSavedGifts(client: TelegramClient, limit = 50) {
  const res: any = await client.invoke(
    new Api.payments.GetSavedStarGifts({
      offset: "",
      limit,
    })
  );
  return res;
}

// Перевод подарка по slug на пользователя
export async function transferGiftBySlug(
  client: TelegramClient,
  slug: string,
  toUserId: number
) {
  const stargift = new Api.InputSavedStarGiftSlug({ slug });

  // ⚠️ В идеале нужен access_hash. Для “как надо” добавим позже сохранение access_hash.
  // Сейчас пробуем резолв пользователя.
  const users: any = await client.invoke(
    new Api.users.GetUsers({
      id: [new Api.InputUser({ userId: BigInt(toUserId), accessHash: BigInt(0) })],
    })
  );

  const u = Array.isArray(users) ? users[0] : null;
  const accessHash = u?.accessHash ? BigInt(u.accessHash) : BigInt(0);

  const toPeer = new Api.InputPeerUser({
    userId: BigInt(toUserId),
    accessHash,
  });

  const r: any = await client.invoke(
    new Api.payments.TransferStarGift({
      stargift,
      toId: toPeer,
    })
  );

  return r;
}