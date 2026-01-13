# CRYPTOCURRENCY TRADING APP
## Project Structure
```
src/
├── common/
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   ├── repositories/
│   │   ├── base.repository.ts
│   │   ├── interfaces/
│   │   └── index.ts
│   ├── services/
│   │   ├── redis.service.ts
│   │   └── cache.service.ts
│   ├── exceptions/
│   └── validators/
├── config/
│   ├── app.config.ts
│   ├── redis.config.ts
│   ├── swagger.config.ts
│   ├── typeorm.config.ts
│   └── env.validation.ts
├── modules/
│   ├── auth/
│   ├── users/
│   ├── currencies/
│   ├── markets/
│   ├── wallets/
│   ├── orders/
│   ├── matching/
│   ├── trades/
│   ├── price-alerts/
│   ├── deposits/
│   ├── withdrawals/
│   ├── websocket/
│   └── jobs/
├── entities/
├── migrations/
└── utils/
```