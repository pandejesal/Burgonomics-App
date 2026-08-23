import express, { Request, Response } from "express";
import serverless from "serverless-http";

export function getPetpoojaHealth() {
  const isEnabled = process.env.PETPOOJA_ENABLED === "true";
  const appKeyPresent = Boolean(process.env.PETPOOJA_APP_KEY);
  const appSecretPresent = Boolean(process.env.PETPOOJA_APP_SECRET);
  const accessTokenPresent = Boolean(process.env.PETPOOJA_ACCESS_TOKEN);

  return {
    status: isEnabled ? (appKeyPresent && accessTokenPresent ? "healthy" : "degraded") : "standby",
    enabled: isEnabled,
    appKeyConfigured: appKeyPresent,
    appSecretConfigured: appSecretPresent,
    accessTokenConfigured: accessTokenPresent,
    branchRestIdPresent: true,
    lastQueueLagMs: 0,
    cacheHit: true,
    endpoint: "https://qle1yy2ydc.execute-api.ap-southeast-1.amazonaws.com/V1",
    timestamp: new Date().toISOString(),
  };
}

const app = express();

app.get(
  [
    "/",
    "/health",
    "/petpoojaHealth",
    "/.netlify/functions/petpooja-health",
    "/api/petpooja/health",
  ],
  (_req: Request, res: Response) => {
    const health = getPetpoojaHealth();
    res.status(200).send(health);
  },
);

export const handler = serverless(app);
