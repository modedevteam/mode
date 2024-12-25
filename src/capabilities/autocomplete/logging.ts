/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Connection } from 'vscode-languageserver/node';

export const DEBUG_MODE = false;

export class Logger {
  private static connection: Connection;

  static initialize(connection: Connection) {
    this.connection = connection;
  }

  static debug(...args: unknown[]) {
    if (DEBUG_MODE) {
      this.connection.console.log(args.join(' '));
    }
  }

  static error(...args: unknown[]) {
    if (DEBUG_MODE) {
      this.connection.console.error(args.join(' '));
    }
  }

  static info(...args: unknown[]) {
    if (DEBUG_MODE) {
      this.connection.console.info(args.join(' '));
    }
  }
}
