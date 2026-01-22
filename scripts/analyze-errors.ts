#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { glob } from 'glob';

interface ErrorEntry {
  timestamp: Date;
  errorType: string;
  statusCode?: number;
  accountName?: string;
  groupName?: string;
  errorCode?: string;
  reason?: string;
  message: string;
}

interface AccountStats {
  count: number;
  errorTypes: Map<string, number>;
  statusCodes: Map<number, number>;
  reasons: Map<string, number>;
}

interface GroupStats {
  count: number;
  errorCodes: Map<string, number>;
  accounts: Set<string>;
}

class ErrorLogAnalyzer {
  private errors: ErrorEntry[] = [];
  private accountStats = new Map<string, AccountStats>();
  private groupStats = new Map<string, GroupStats>();
  private hourlyDistribution = new Map<number, number>();

  parseLogContent(content: string) {
    const lines = content.split('\n');

    for (const line of lines) {
      if (!line.includes('ERROR:')) continue;

      const entry = this.parseLine(line);
      if (entry) {
        this.errors.push(entry);
        this.updateStats(entry);
      }
    }
  }

  private parseLine(line: string): ErrorEntry | null {
    const timestampMatch = line.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/);
    if (!timestampMatch) return null;

    const timestamp = new Date(timestampMatch[1]);
    const entry: ErrorEntry = {
      timestamp,
      errorType: this.extractErrorType(line),
      message: line,
    };

    const statusMatch = line.match(/status:\s*(\d{3})/);
    if (statusMatch) entry.statusCode = parseInt(statusMatch[1]);

    const accountMatch = line.match(/Account:\s*([^\s,}]+)/);
    if (accountMatch) entry.accountName = accountMatch[1].trim();

    const jsonMatch = line.match(/\{[^}]*"groupName":"([^"]+)"[^}]*\}/);
    if (jsonMatch) entry.groupName = jsonMatch[1];

    const errorCodeMatch = line.match(/"errorCode":"([^"]+)"/);
    if (errorCodeMatch) entry.errorCode = errorCodeMatch[1];

    const codeMatch = line.match(/"code":"([^"]+)"/);
    if (codeMatch) entry.errorCode = codeMatch[1];

    const reasonMatch = line.match(/"reason":"([^"]+)"/);
    if (reasonMatch) entry.reason = reasonMatch[1];

    return entry;
  }

  private extractErrorType(line: string): string {
    if (line.includes('Failed to select account for API key')) return 'NO_ACCOUNT_AVAILABLE';
    if (line.includes('stream relay failed')) return 'STREAM_RELAY_FAILED';
    if (line.includes('API returned error status')) return 'API_ERROR_STATUS';
    if (line.includes('Upstream error response')) return 'UPSTREAM_ERROR';
    return 'OTHER';
  }

  private updateStats(entry: ErrorEntry) {
    const hour = entry.timestamp.getHours();
    this.hourlyDistribution.set(hour, (this.hourlyDistribution.get(hour) || 0) + 1);

    if (entry.accountName) {
      if (!this.accountStats.has(entry.accountName)) {
        this.accountStats.set(entry.accountName, {
          count: 0,
          errorTypes: new Map(),
          statusCodes: new Map(),
          reasons: new Map(),
        });
      }
      const stats = this.accountStats.get(entry.accountName)!;
      stats.count++;
      stats.errorTypes.set(entry.errorType, (stats.errorTypes.get(entry.errorType) || 0) + 1);
      if (entry.statusCode) {
        stats.statusCodes.set(entry.statusCode, (stats.statusCodes.get(entry.statusCode) || 0) + 1);
      }
      if (entry.reason) {
        stats.reasons.set(entry.reason, (stats.reasons.get(entry.reason) || 0) + 1);
      }
    }

    if (entry.groupName) {
      if (!this.groupStats.has(entry.groupName)) {
        this.groupStats.set(entry.groupName, {
          count: 0,
          errorCodes: new Map(),
          accounts: new Set(),
        });
      }
      const stats = this.groupStats.get(entry.groupName)!;
      stats.count++;
      if (entry.errorCode) {
        stats.errorCodes.set(entry.errorCode, (stats.errorCodes.get(entry.errorCode) || 0) + 1);
      }
      if (entry.accountName) {
        stats.accounts.add(entry.accountName);
      }
    }
  }

  generateReport(): string {
    const report: string[] = [];

    report.push('═══════════════════════════════════════════════════════════════');
    report.push('           CLAUDE RELAY ERROR LOG ANALYSIS REPORT');
    report.push('═══════════════════════════════════════════════════════════════\n');

    report.push(`Total Errors: ${this.errors.length}`);
    report.push(`Analysis Period: ${this.errors[0]?.timestamp.toISOString()} to ${this.errors[this.errors.length - 1]?.timestamp.toISOString()}\n`);

    report.push('───────────────────────────────────────────────────────────────');
    report.push('1. ERROR TYPE DISTRIBUTION');
    report.push('───────────────────────────────────────────────────────────────');
    const errorTypeCounts = new Map<string, number>();
    this.errors.forEach(e => {
      errorTypeCounts.set(e.errorType, (errorTypeCounts.get(e.errorType) || 0) + 1);
    });
    const sortedErrorTypes = Array.from(errorTypeCounts.entries()).sort((a, b) => b[1] - a[1]);
    sortedErrorTypes.forEach(([type, count]) => {
      const pct = ((count / this.errors.length) * 100).toFixed(2);
      report.push(`  ${type.padEnd(30)} ${count.toString().padStart(6)} (${pct}%)`);
    });
    report.push('');

    report.push('───────────────────────────────────────────────────────────────');
    report.push('2. TOP 20 ACCOUNTS BY ERROR COUNT (Pareto Analysis)');
    report.push('───────────────────────────────────────────────────────────────');
    const sortedAccounts = Array.from(this.accountStats.entries()).sort((a, b) => b[1].count - a[1].count);
    let cumulative = 0;
    sortedAccounts.slice(0, 20).forEach(([account, stats], idx) => {
      cumulative += stats.count;
      const pct = ((stats.count / this.errors.length) * 100).toFixed(2);
      const cumPct = ((cumulative / this.errors.length) * 100).toFixed(2);
      report.push(`  ${(idx + 1).toString().padStart(2)}. ${account.padEnd(35)} ${stats.count.toString().padStart(5)} (${pct}%) [Cum: ${cumPct}%]`);
    });
    report.push('');

    report.push('───────────────────────────────────────────────────────────────');
    report.push('3. API KEY GROUP ANALYSIS');
    report.push('───────────────────────────────────────────────────────────────');
    const sortedGroups = Array.from(this.groupStats.entries()).sort((a, b) => b[1].count - a[1].count);
    sortedGroups.forEach(([group, stats]) => {
      report.push(`\n  Group: ${group}`);
      report.push(`    Total Errors: ${stats.count}`);
      report.push(`    Affected Accounts: ${stats.accounts.size}`);
      report.push(`    Error Codes:`);
      const sortedCodes = Array.from(stats.errorCodes.entries()).sort((a, b) => b[1] - a[1]);
      sortedCodes.forEach(([code, count]) => {
        report.push(`      - ${code}: ${count}`);
      });
    });
    report.push('');

    report.push('───────────────────────────────────────────────────────────────');
    report.push('4. STATUS CODE DISTRIBUTION');
    report.push('───────────────────────────────────────────────────────────────');
    const statusCodes = new Map<number, number>();
    this.errors.forEach(e => {
      if (e.statusCode) {
        statusCodes.set(e.statusCode, (statusCodes.get(e.statusCode) || 0) + 1);
      }
    });
    const sortedStatus = Array.from(statusCodes.entries()).sort((a, b) => b[1] - a[1]);
    sortedStatus.forEach(([code, count]) => {
      const pct = ((count / this.errors.length) * 100).toFixed(2);
      report.push(`  HTTP ${code}: ${count} (${pct}%)`);
    });
    report.push('');

    report.push('───────────────────────────────────────────────────────────────');
    report.push('5. HOURLY ERROR DISTRIBUTION (Time Series)');
    report.push('───────────────────────────────────────────────────────────────');
    const maxHourlyCount = Math.max(...Array.from(this.hourlyDistribution.values()));
    for (let hour = 0; hour < 24; hour++) {
      const count = this.hourlyDistribution.get(hour) || 0;
      const barLength = Math.round((count / maxHourlyCount) * 50);
      const bar = '█'.repeat(barLength);
      report.push(`  ${hour.toString().padStart(2)}:00 ${count.toString().padStart(5)} ${bar}`);
    }
    report.push('');

    report.push('───────────────────────────────────────────────────────────────');
    report.push('6. FAILURE REASON ANALYSIS');
    report.push('───────────────────────────────────────────────────────────────');
    const allReasons = new Map<string, number>();
    this.accountStats.forEach(stats => {
      stats.reasons.forEach((count, reason) => {
        allReasons.set(reason, (allReasons.get(reason) || 0) + count);
      });
    });
    const sortedReasons = Array.from(allReasons.entries()).sort((a, b) => b[1] - a[1]);
    sortedReasons.forEach(([reason, count]) => {
      const pct = ((count / this.errors.length) * 100).toFixed(2);
      report.push(`  ${reason.padEnd(40)} ${count.toString().padStart(5)} (${pct}%)`);
    });
    report.push('');

    report.push('───────────────────────────────────────────────────────────────');
    report.push('7. DETAILED ACCOUNT BREAKDOWN (Top 10)');
    report.push('───────────────────────────────────────────────────────────────');
    sortedAccounts.slice(0, 10).forEach(([account, stats]) => {
      report.push(`\n  Account: ${account}`);
      report.push(`    Total Errors: ${stats.count}`);
      report.push(`    Error Types:`);
      Array.from(stats.errorTypes.entries()).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
        report.push(`      - ${type}: ${count}`);
      });
      if (stats.statusCodes.size > 0) {
        report.push(`    Status Codes:`);
        Array.from(stats.statusCodes.entries()).sort((a, b) => b[1] - a[1]).forEach(([code, count]) => {
          report.push(`      - ${code}: ${count}`);
        });
      }
      if (stats.reasons.size > 0) {
        report.push(`    Failure Reasons:`);
        Array.from(stats.reasons.entries()).sort((a, b) => b[1] - a[1]).forEach(([reason, count]) => {
          report.push(`      - ${reason}: ${count}`);
        });
      }
    });
    report.push('');

    report.push('═══════════════════════════════════════════════════════════════');
    report.push('                    KEY INSIGHTS');
    report.push('═══════════════════════════════════════════════════════════════');

    const top3Accounts = sortedAccounts.slice(0, 3);
    const top3Pct = (top3Accounts.reduce((sum, [, stats]) => sum + stats.count, 0) / this.errors.length * 100).toFixed(1);
    report.push(`• Top 3 accounts contribute ${top3Pct}% of all errors`);

    const mostCommonError = sortedErrorTypes[0];
    report.push(`• Most common error type: ${mostCommonError[0]} (${((mostCommonError[1] / this.errors.length) * 100).toFixed(1)}%)`);

    const peakHour = Array.from(this.hourlyDistribution.entries()).sort((a, b) => b[1] - a[1])[0];
    report.push(`• Peak error hour: ${peakHour[0]}:00 with ${peakHour[1]} errors`);

    report.push(`• Total unique accounts affected: ${this.accountStats.size}`);
    report.push(`• Total API key groups affected: ${this.groupStats.size}`);

    report.push('\n═══════════════════════════════════════════════════════════════\n');

    return report.join('\n');
  }
}

async function readLogFile(filePath: string): Promise<string> {
  const isGzipped = filePath.endsWith('.gz');

  if (isGzipped) {
    const compressed = fs.readFileSync(filePath);
    const decompressed = zlib.gunzipSync(compressed);
    return decompressed.toString('utf-8');
  } else {
    return fs.readFileSync(filePath, 'utf-8');
  }
}

async function main() {
  const pattern = process.argv[2] || '/tmp/claude-relay-error.log';

  console.log(`Searching for log files matching: ${pattern}\n`);

  const files = await glob(pattern, { nodir: true });

  if (files.length === 0) {
    console.error(`No files found matching pattern: ${pattern}`);
    process.exit(1);
  }

  console.log(`Found ${files.length} file(s):`);
  files.forEach((f: string) => console.log(`  - ${f}`));
  console.log('\nAnalyzing error logs...\n');

  const analyzer = new ErrorLogAnalyzer();

  for (const file of files) {
    try {
      const content = await readLogFile(file);
      analyzer.parseLogContent(content);
    } catch (error) {
      console.error(`Error reading file ${file}:`, error);
    }
  }

  const report = analyzer.generateReport();
  console.log(report);

  const outputPath = path.join(process.cwd(), 'error-analysis-report.txt');
  fs.writeFileSync(outputPath, report);
  console.log(`\nReport saved to: ${outputPath}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
