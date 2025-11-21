import { createWriteStream, promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as core from "@actions/core";
import { request } from "undici";

interface DownloadOptions {
  maxRetries?: number;
  socketTimeout?: number;
  initialRetryDelay?: number;
  maxRetryDelay?: number;
  auth?: string;
}

/**
 * Downloads a file with resume capability using HTTP Range requests.
 * If the download fails, it will resume from where it left off on retry.
 * This is particularly useful for large files on weak or unreliable networks.
 *
 * @param url The URL to download from
 * @param destPath Optional destination path. If not provided, uses a temp directory
 * @param options Download options including retry configuration
 * @returns The path to the downloaded file
 */
export async function downloadToolWithResume(
  url: string,
  destPath?: string,
  options: DownloadOptions = {},
): Promise<string> {
  const {
    maxRetries = 5,
    socketTimeout = 60000, // 60 seconds
    initialRetryDelay = 10000, // 10 seconds
    maxRetryDelay = 120000, // 2 minutes
    auth,
  } = options;

  // Use provided path or create a temp file
  const downloadPath =
    destPath || path.join(os.tmpdir(), `setup-uv-${Date.now()}`);

  let downloadedBytes = 0;
  let totalBytes: number | undefined;
  let lastError: Error | undefined;

  // Check if partial file exists from previous attempt
  try {
    const stats = await fs.stat(downloadPath);
    downloadedBytes = stats.size;
    if (downloadedBytes > 0) {
      core.info(
        `Found partial download, resuming from ${formatBytes(downloadedBytes)}`,
      );
    }
  } catch {
    // File doesn't exist, start from beginning
    downloadedBytes = 0;
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      core.info(
        `Download attempt ${attempt + 1}/${maxRetries} (${formatBytes(downloadedBytes)} downloaded)`,
      );

      const headers: Record<string, string> = {};

      // Add authorization if provided
      if (auth) {
        headers.Authorization = auth;
      }

      // Add Range header for resume if we have partial data
      if (downloadedBytes > 0) {
        headers.Range = `bytes=${downloadedBytes}-`;
        core.debug(`Resuming download from byte ${downloadedBytes}`);
      }

      const response = await request(url, {
        method: "GET",
        headers,
        headersTimeout: socketTimeout,
        bodyTimeout: socketTimeout,
      });

      // Check status codes
      // 200 = OK (full download)
      // 206 = Partial Content (resume successful)
      if (response.statusCode === 200) {
        // Server doesn't support resume or file was deleted/changed
        if (downloadedBytes > 0) {
          core.warning(
            "Server returned 200 instead of 206, starting download from beginning",
          );
          downloadedBytes = 0;
          // Delete partial file
          try {
            await fs.unlink(downloadPath);
          } catch {
            // Ignore error if file doesn't exist
          }
        }
      } else if (response.statusCode === 206) {
        core.debug("Server supports resume, continuing download");
      } else if (
        response.statusCode &&
        response.statusCode >= 400 &&
        response.statusCode < 500
      ) {
        // Client errors (404, 403, etc.) - don't retry
        throw new Error(
          `Download failed with status ${response.statusCode}: ${response.body}`,
        );
      } else {
        // Server errors or unexpected status - will retry
        throw new Error(`Unexpected status code: ${response.statusCode}`);
      }

      // Get total file size from headers
      const contentLength = response.headers["content-length"];
      if (contentLength) {
        const chunkSize = Number.parseInt(contentLength as string, 10);
        if (response.statusCode === 206) {
          totalBytes = downloadedBytes + chunkSize;
        } else {
          totalBytes = chunkSize;
        }
        core.info(`Total file size: ${formatBytes(totalBytes)}`);
      }

      // Open file stream (append if resuming, write if starting fresh)
      const fileStream = createWriteStream(downloadPath, {
        flags: downloadedBytes > 0 ? "a" : "w",
      });

      // Track progress
      let bytesInCurrentAttempt = 0;
      const startTime = Date.now();

      // Pipe response to file with progress tracking
      if (response.body) {
        for await (const chunk of response.body) {
          fileStream.write(chunk);
          bytesInCurrentAttempt += chunk.length;
          downloadedBytes += chunk.length;

          // Log progress every 10MB
          if (bytesInCurrentAttempt % (10 * 1024 * 1024) < chunk.length) {
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = bytesInCurrentAttempt / elapsed / 1024 / 1024;
            const progress = totalBytes
              ? `${Math.round((downloadedBytes / totalBytes) * 100)}%`
              : formatBytes(downloadedBytes);
            core.info(
              `Downloaded ${progress} at ${speed.toFixed(2)} MB/s`,
            );
          }
        }
      }

      // Close file stream
      await new Promise<void>((resolve, reject) => {
        fileStream.end((err?: Error) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Download completed successfully
      core.info(
        `Download completed: ${formatBytes(downloadedBytes)} in ${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      );
      return downloadPath;
    } catch (err) {
      lastError = err as Error;
      core.warning(
        `Download attempt ${attempt + 1} failed: ${(err as Error).message}`,
      );

      // Check current file size in case we got partial data before error
      try {
        const stats = await fs.stat(downloadPath);
        downloadedBytes = stats.size;
        core.debug(`Current download size: ${formatBytes(downloadedBytes)}`);
      } catch {
        // File might not exist yet
        downloadedBytes = 0;
      }

      // Don't retry on client errors (4xx)
      if (
        lastError.message.includes("status 4") &&
        !lastError.message.includes("408") &&
        !lastError.message.includes("429")
      ) {
        throw lastError;
      }

      // Calculate retry delay with exponential backoff
      if (attempt < maxRetries - 1) {
        const retryDelay = Math.min(
          initialRetryDelay * Math.pow(2, attempt),
          maxRetryDelay,
        );
        core.info(`Waiting ${retryDelay / 1000} seconds before retry...`);
        await sleep(retryDelay);
      }
    }
  }

  // All retries exhausted
  throw new Error(
    `Download failed after ${maxRetries} attempts. Last error: ${lastError?.message}`,
  );
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
