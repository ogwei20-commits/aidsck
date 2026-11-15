import { config } from "dotenv";

// 集成测试连接的是本地开发库，测试数据统一带 [测试] 前缀，跑完即清理
config({ path: ".env.local" });
config({ path: ".env" });
