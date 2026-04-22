const fs = require('fs');
const path = require('path');

const provider = process.argv[2];

if (!['postgresql', 'mysql'].includes(provider)) {
  console.error("Please specify a valid provider: postgresql or mysql");
  process.exit(1);
}

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf-8');

schema = schema.replace(
  /provider\s*=\s*"(postgresql|mysql)"/,
  `provider = "${provider}"`
);

fs.writeFileSync(schemaPath, schema);
console.log(`Successfully set Prisma provider to ${provider}`);
