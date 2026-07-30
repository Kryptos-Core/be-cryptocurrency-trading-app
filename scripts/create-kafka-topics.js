/**
 * Script to create Kafka topics for production deployment.
 * Run after `npm run docker:infra:up:full` to ensure Kafka is ready.
 *
 * Topics are auto-created in dev (KAFKA_AUTO_CREATE_TOPICS_ENABLE=true).
 * For production, explicit topic creation allows better control over
 * partitions, replication, and retention settings.
 */

const { execSync } = require('child_process');
const { KAFKA_BROKER = 'localhost:9092' } = process.env;

const TOPICS = [
  { name: 'crypto-trading.orderplaced', partitions: 6, replicationFactor: 1 },
  { name: 'crypto-trading.ordercancelled', partitions: 6, replicationFactor: 1 },
  { name: 'crypto-trading.tradeexecuted', partitions: 6, replicationFactor: 1 },
  { name: 'crypto-trading.depositconfirmed', partitions: 3, replicationFactor: 1 },
  { name: 'crypto-trading.walletbalancechanged', partitions: 6, replicationFactor: 1 },
  { name: 'crypto-trading.market.ticker', partitions: 3, replicationFactor: 1 },
];

function runCommand(cmd, options = {}) {
  try {
    console.log(`> ${cmd}`);
    execSync(cmd, { stdio: 'inherit', ...options });
    return true;
  } catch (error) {
    console.error(`Failed: ${cmd}`);
    return false;
  }
}

function topicExists(name) {
  try {
    const output = execSync(
      `docker exec kafka kafka-topics --bootstrap-server ${KAFKA_BROKER} --list`,
      { encoding: 'utf8' },
    );
    return output.includes(name);
  } catch {
    return false;
  }
}

async function main() {
  console.log('Kafka Topics Setup Script');
  console.log(`Broker: ${KAFKA_BROKER}`);
  console.log('');

  for (const topic of TOPICS) {
    if (topicExists(topic.name)) {
      console.log(`[SKIP] Topic already exists: ${topic.name}`);
      continue;
    }

    console.log(`[CREATE] Creating topic: ${topic.name}`);
    const cmd = [
      'docker exec kafka kafka-topics',
      `--bootstrap-server ${KAFKA_BROKER}`,
      '--create',
      `--topic ${topic.name}`,
      `--partitions ${topic.partitions}`,
      `--replication-factor ${topic.replicationFactor}`,
    ].join(' ');

    if (!runCommand(cmd)) {
      console.error(`Failed to create topic: ${topic.name}`);
      process.exit(1);
    }
  }

  console.log('');
  console.log('Done. Listing all topics:');
  runCommand(
    `docker exec kafka kafka-topics --bootstrap-server ${KAFKA_BROKER} --list`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
