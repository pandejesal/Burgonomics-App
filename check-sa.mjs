import fs from "node:fs";

const sa = JSON.parse(
  fs.readFileSync("C:/Users/DELL/AppData/Local/Temp/opencode/creds/service-account.json", "utf8"),
);

const gs = JSON.parse(fs.readFileSync("android/app/google-services.json", "utf8"));

console.log("service-account project_id :", sa.project_id);
console.log("service-account client_email:", sa.client_email);
console.log(
  "has private_key            :",
  typeof sa.private_key === "string" && sa.private_key.length > 50,
);
console.log("google-services project_id :", gs.project_info?.project_id);
console.log("match                      :", sa.project_id === gs.project_info?.project_id);
