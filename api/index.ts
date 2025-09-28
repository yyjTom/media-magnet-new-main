import app, { ready } from '../server/app.js';

export default async function handler(req: any, res: any) {
  await ready;
  return app(req, res);
}


