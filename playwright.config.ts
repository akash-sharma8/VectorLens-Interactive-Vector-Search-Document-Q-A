import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',fullyParallel:false,workers:1,
  use:{baseURL:'http://127.0.0.1:3000',headless:true,launchOptions:process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']}:undefined,viewport:{width:1440,height:1000}},
  webServer:[
    {command:'node scripts/ollama-fixture.mjs',url:'http://127.0.0.1:11435/api/tags',reuseExistingServer:false},
    {command:'npm run start -w @vectordb/api',url:'http://127.0.0.1:8080/stats',env:{OLLAMA_BASE_URL:'http://127.0.0.1:11435'},reuseExistingServer:false},
    {command:'npm run start -w @vectordb/web -- --hostname 127.0.0.1',url:'http://127.0.0.1:3000',reuseExistingServer:false},
  ],
});
