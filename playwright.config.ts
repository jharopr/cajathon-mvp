import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/e2e',timeout:90000,workers:1,use:{baseURL:'http://127.0.0.1:5180',headless:true},
  webServer:[{command:'npm run start:api',url:'http://127.0.0.1:8081/api/v1/health',reuseExistingServer:true,timeout:30000},{command:'npm run dev:web',url:'http://127.0.0.1:5180',reuseExistingServer:true,timeout:30000}]});

