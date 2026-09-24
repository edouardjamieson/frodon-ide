import fs from 'node:fs';

export default class Logger {
  static logPath = './test.log';

  static log(message: unknown, json?: boolean) {
    fs.appendFileSync(
      Logger.logPath,
      `${json ? JSON.stringify(message, null, 2) : message}\n`
    );
  }
}
