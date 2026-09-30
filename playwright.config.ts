import { defineConfig } from '@playwright/test';
if(!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test'))throw new Error('Browser tests require TEST_DATABASE_URL ending in _test.');
export default defineConfig({
  testDir:'./tests/browser',fullyParallel:false,workers:1,timeout:60000,
  use:{baseURL:'http://127.0.0.1:13000',headless:true,launchOptions:process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']}:undefined,viewport:{width:1440,height:1000}},
  webServer:[
    {command:'node scripts/ollama-fixture.mjs',url:'http://127.0.0.1:11435/api/tags',reuseExistingServer:false},
    {command:'node --import tsx scripts/browser-test-api.mts',url:'http://127.0.0.1:18080/health/db',env:{OLLAMA_BASE_URL:'http://127.0.0.1:11435',WEB_ORIGIN:'http://127.0.0.1:13000'},reuseExistingServer:false},
    {command:'npm run dev -w @vectordb/web -- --hostname 127.0.0.1 --port 13000',url:'http://127.0.0.1:13000',env:{API_ORIGIN:'http://127.0.0.1:18080',NEXT_DIST_DIR:'.next-test'},reuseExistingServer:false},
  ],
});
