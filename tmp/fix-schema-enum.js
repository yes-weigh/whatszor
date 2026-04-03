const fs = require('fs');
let c = fs.readFileSync('d:/whatszor/apps/api/prisma/schema.prisma', 'utf8');

if (!c.includes('enum MatchType')) {
  c = c.replace(/enum BotMode \{\s*INTERNAL\s*EXTERNAL\s*HYBRID\s*\}/, `enum BotMode {\n  INTERNAL\n  EXTERNAL\n  HYBRID\n}\n\nenum MatchType {\n  EXACT\n  CONTAINS\n  REGEX\n  AI_INTENT\n}`);
  fs.writeFileSync('d:/whatszor/apps/api/prisma/schema.prisma', c);
  console.log("Added enum MatchType");
} else {
  console.log("Enum MatchType already exists.");
}
