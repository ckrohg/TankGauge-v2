// TankFarm Scraper - Updated Dec 5, 2025 with improved login verification
import puppeteer, { type Browser, type Page } from "puppeteer";
import OpenAI from "openai";
import { type InsertTankReading, type InsertDelivery, type InsertPayment } from "../schema.js";
import { execSync } from "child_process";

export interface TankFarmData {
  tankReading: InsertTankReading;
  deliveries?: InsertDelivery[];
  payments?: InsertPayment[];
}

export class TankFarmScraper {
  private browser: Browser | null = null;
  private openai: OpenAI;
  private scrapeInProgress: boolean = false; // Lock to prevent concurrent resets

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Force close and reset browser (for recovery after errors)
   * Only resets if no scrape is currently in progress
   */
  async forceReset(): Promise<void> {
    if (this.scrapeInProgress) {
      console.log('[TankFarm Scraper] Skipping forceReset - scrape in progress');
      return;
    }
    
    console.log('[TankFarm Scraper] Force resetting browser...');
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (e) {
        // Ignore errors when closing
      }
      this.browser = null;
    }
  }
  
  async initialize(): Promise<void> {
    // Check if existing browser is healthy
    if (this.browser) {
      try {
        if (this.browser.connected) {
          // Test that browser is actually responsive
          const pages = await this.browser.pages();
          return; // Browser is healthy
        }
      } catch (e) {
        console.log('[TankFarm Scraper] Existing browser not responding, resetting...');
      }
      
      // Browser exists but is not healthy - close it
      try {
        await this.browser.close();
      } catch (e) {
        // Ignore errors when closing disconnected browser
      }
      this.browser = null;
    }
    
    // Try to find system chromium, fallback to Puppeteer's bundled Chromium
    let chromiumPath: string | undefined;
    try {
      chromiumPath = execSync('which chromium', { encoding: 'utf-8' }).trim();
      if (chromiumPath) {
        console.log('[TankFarm Scraper] Using system chromium:', chromiumPath);
      }
    } catch (e) {
      console.log('[TankFarm Scraper] System chromium not found, using Puppeteer bundled Chromium');
      chromiumPath = undefined; // Let Puppeteer use its bundled binary
    }
    
    console.log('[TankFarm Scraper] Launching browser...');
    
    // Production-ready Chrome args for headless environment
    const launchOptions: any = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-sync',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-first-run',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920,1080',
        '--disable-notifications',
      ],
      timeout: 90000,
      protocolTimeout: 90000,
    };
    
    // Only add executablePath if we found system chromium
    if (chromiumPath) {
      launchOptions.executablePath = chromiumPath;
    }
    
    // Retry logic with exponential backoff
    const maxRetries = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[TankFarm Scraper] Launch attempt ${attempt}/${maxRetries}...`);
        this.browser = await puppeteer.launch(launchOptions);
        console.log('[TankFarm Scraper] ✓ Browser launched successfully');
        
        // Validate browser is actually working with a quick test
        const testPage = await this.browser.newPage();
        await testPage.close();
        console.log('[TankFarm Scraper] ✓ Browser validated and ready');
        return; // Success!
      } catch (launchError: any) {
        lastError = launchError;
        console.error(`[TankFarm Scraper] ✗ Launch attempt ${attempt} failed:`, launchError.message);
        
        if (attempt < maxRetries) {
          const delayMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          console.log(`[TankFarm Scraper] Retrying in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
    
    // All retries failed
    const errorMsg = lastError?.message || 'Unknown error';
    console.error('[TankFarm Scraper] ✗ All launch attempts failed');
    throw new Error(`Failed to initialize browser after ${maxRetries} attempts: ${errorMsg}`);
  }
  
  /**
   * Create a fresh incognito context for each scrape to avoid session issues
   */
  private async createFreshContext() {
    if (!this.browser) {
      throw new Error("Browser not initialized");
    }
    return await this.browser.createBrowserContext();
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Scrape data from tankfarm.io using hybrid AI vision + DOM extraction
   * 
   * Strategy:
   * 1. Login to tankfarm.io (or detect existing session)
   * 2. Extract timestamp from DOM (fallback to AI vision)
   * 3. Always extract full tank data (never abort early)
   * 4. Deduplication happens server-side by comparing actual readings
   * 5. Use AI vision for robust extraction with DOM validation
   */
  async scrapeTankData(username: string, password: string): Promise<TankFarmData | null> {
    // Use mock data if no credentials provided
    if (!username || !password) {
      console.log('[TankFarm Scraper] No credentials provided, using mock data');
      return this.getMockData();
    }

    console.log('[TankFarm Scraper] Starting AI-powered scrape with credentials...');

    // Set lock to prevent concurrent browser resets
    this.scrapeInProgress = true;
    
    await this.initialize();

    if (!this.browser) {
      this.scrapeInProgress = false;
      throw new Error("Browser not initialized");
    }

    // Use fresh incognito context to avoid session conflicts
    const context = await this.createFreshContext();
    const page = await context.newPage();
    
    try {
      await page.setViewport({ width: 1920, height: 1080 });
      
      // Spoof automation fingerprints to bypass bot detection
      await page.evaluateOnNewDocument(() => {
        // Hide webdriver property
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });
        
        // Spoof plugins (empty array triggers bot detection)
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });
        
        // Spoof languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en'],
        });
        
        // Chrome-specific spoofing
        (window as any).chrome = {
          runtime: {},
        };
      });
      
      // Set a realistic user agent
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Listen to console logs from page.evaluate() calls
      page.on('console', msg => {
        const text = msg.text();
        if (text.includes('Found') || text.includes('Billing') || text.includes('password')) {
          console.log(`[Browser Console] ${text}`);
        }
      });

      // Navigate and handle login/session
      await this.loginOrResumeSession(page, username, password);

      // Wait for dashboard to fully load
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log('[TankFarm Scraper] Extracting current tank data...');
      
      // Always perform full data extraction - never abort early based on timestamps
      // Deduplication happens server-side by comparing actual readings
      const fullScreenshot = await page.screenshot({ 
        encoding: 'base64',
        fullPage: true 
      });

      // Also extract HTML for DOM-based timestamp extraction
      const pageHTML = await page.content();

      // Try DOM-based timestamp extraction first (more reliable than AI vision)
      const domTimestamp = await this.extractTimestampFromDOM(page);
      if (domTimestamp) {
        console.log(`[TankFarm Scraper] DOM extracted timestamp: ${domTimestamp.toISOString()}`);
      } else {
        console.log('[TankFarm Scraper] Could not extract timestamp from DOM, will use AI vision fallback');
      }

      console.log('[TankFarm Scraper] Extracting tank data using AI vision with DOM validation...');
      const currentData = await this.extractDataWithVision(fullScreenshot, pageHTML, 'current');

      // Use DOM timestamp if available, otherwise fall back to AI-extracted timestamp
      if (domTimestamp) {
        currentData.tankReading.tankfarmLastUpdate = domTimestamp;
        console.log('[TankFarm Scraper] Using DOM-extracted timestamp (more reliable)');
      } else if (currentData.tankReading.tankfarmLastUpdate) {
        console.log(`[TankFarm Scraper] Using AI-extracted timestamp: ${currentData.tankReading.tankfarmLastUpdate.toISOString()}`);
      } else {
        console.warn('[TankFarm Scraper] No timestamp extracted - using current time');
        currentData.tankReading.tankfarmLastUpdate = new Date();
      }

      // Try to navigate to Billing tab for full historical data
      console.log('[TankFarm Scraper] Looking for Billing tab for historical data...');
      const historicalData = await this.extractHistoricalData(page);

      // De-duplicate deliveries: prefer Billing tab data over dashboard data
      // Match by delivery date (same day = same delivery)
      const billingDeliveryDates = new Set(
        historicalData.deliveries.map(d => d.deliveryDate.toDateString())
      );
      
      const uniqueDashboardDeliveries = (currentData.deliveries || []).filter(d => 
        !billingDeliveryDates.has(d.deliveryDate.toDateString())
      );

      const allDeliveries = [
        ...historicalData.deliveries, // Billing tab is authoritative
        ...uniqueDashboardDeliveries   // Add dashboard-only deliveries if any
      ];

      return {
        tankReading: currentData.tankReading,
        deliveries: allDeliveries.length > 0 ? allDeliveries : undefined,
        payments: historicalData.payments.length > 0 ? historicalData.payments : undefined,
      };

    } finally {
      // Always close page and context, even on early returns or errors
      try {
        await page.close();
      } catch (e) {
        console.warn('[TankFarm Scraper] Error closing page:', e);
      }
      try {
        await context.close();
      } catch (e) {
        console.warn('[TankFarm Scraper] Error closing context:', e);
      }
      
      // Clear the scrape-in-progress lock
      this.scrapeInProgress = false;
    }
  }

  /**
   * Handle login (session state managed by incognito context, so always login)
   */
  private async loginOrResumeSession(page: Page, username: string, password: string): Promise<void> {
    try {
      // Since we're using fresh incognito context, go directly to sign-in page
      console.log('[TankFarm Scraper] Navigating to sign-in page...');
      await page.goto('https://my.tankfarm.io/auth/sign_in', { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // CRITICAL: Click "Log in with password" toggle/link BEFORE entering email
      console.log('[TankFarm Scraper] Looking for "Log in with password" option...');
      const passwordToggleClicked = await page.evaluate(() => {
        // Look for various ways the password toggle might be implemented
        const elements = Array.from(document.querySelectorAll('a, button, [role="button"], [onclick]'));
        for (const elem of elements) {
          const text = elem.textContent?.toLowerCase() || '';
          const ariaLabel = elem.getAttribute('aria-label')?.toLowerCase() || '';
          if (text.includes('password') || text.includes('use password') || 
              ariaLabel.includes('password') || ariaLabel.includes('use password')) {
            console.log('Found password toggle:', elem.textContent);
            (elem as HTMLElement).click();
            return true;
          }
        }
        return false;
      });
      
      if (passwordToggleClicked) {
        console.log('[TankFarm Scraper] Clicked "Use password" toggle');
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        // Try navigating directly with password param
        console.log('[TankFarm Scraper] No password toggle found, trying direct URL with ?use_password=true...');
        await page.goto('https://my.tankfarm.io/auth/sign_in?use_password=true', { 
          waitUntil: 'networkidle2',
          timeout: 30000 
        });
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Now look for email and password fields (both should be visible)
      console.log('[TankFarm Scraper] Looking for email field...');
      const emailField = await page.waitForSelector('input[type="email"]', { 
        visible: true,
        timeout: 10000 
      });
      
      if (!emailField) {
        throw new Error('Email field not found');
      }

      console.log('[TankFarm Scraper] Looking for password field...');
      const passwordField = await page.waitForSelector('input[type="password"]', { 
        visible: true,
        timeout: 10000 
      });
      
      if (!passwordField) {
        const debugScreenshot = await page.screenshot({ encoding: 'base64', fullPage: true });
        console.error('[TankFarm Scraper] Password field not visible. URL:', page.url());
        throw new Error('Password field not found - password login may not be enabled');
      }

      console.log('[TankFarm Scraper] Filling in credentials...');
      
      // Click into email field to focus it (helps with React forms)
      await emailField.click();
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Clear any existing value first
      await emailField.evaluate((el: HTMLInputElement) => el.value = '');
      await emailField.type(username, { delay: 75 });
      
      // Click into password field
      await passwordField.click();
      await new Promise(resolve => setTimeout(resolve, 200));
      await passwordField.type(password, { delay: 75 });
      
      // Wait for React to process the input
      await new Promise(resolve => setTimeout(resolve, 1500));

      console.log('[TankFarm Scraper] Submitting login form...');
      
      // Wait for submit button to be enabled (React forms often disable until validated)
      let submitReady = false;
      for (let i = 0; i < 10; i++) {
        const buttonState = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"], button'));
          for (const btn of buttons) {
            const text = btn.textContent?.toLowerCase() || '';
            const value = (btn as HTMLInputElement).value?.toLowerCase() || '';
            if (text.includes('log in') || text.includes('sign in') || text.includes('login') || 
                value.includes('log in') || value.includes('sign in') || text.includes('submit')) {
              return {
                disabled: (btn as HTMLButtonElement).disabled,
                text: text.trim()
              };
            }
          }
          return null;
        });
        
        if (buttonState && !buttonState.disabled) {
          console.log(`[TankFarm Scraper] Submit button is enabled: "${buttonState.text}"`);
          submitReady = true;
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // Try multiple submission methods for robustness
      let submitted = false;
      
      // Method 1: Click the submit button via page.evaluate (more reliable for React)
      try {
        const clicked = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
          for (const btn of buttons) {
            const text = btn.textContent?.toLowerCase() || '';
            const value = (btn as HTMLInputElement).value?.toLowerCase() || '';
            if ((text.includes('log in') || text.includes('sign in') || text.includes('login') || 
                value.includes('log in') || value.includes('sign in')) && !(btn as HTMLButtonElement).disabled) {
              console.log('Clicking login button:', text);
              (btn as HTMLElement).click();
              return true;
            }
          }
          return false;
        });
        if (clicked) {
          console.log('[TankFarm Scraper] Clicked login button via evaluate');
          submitted = true;
        }
      } catch (e) {
        console.log('[TankFarm Scraper] Button evaluate click failed:', e);
      }
      
      // Method 2: Try clicking the button element directly
      if (!submitted) {
        try {
          const submitButton = await page.$('button[type="submit"]');
          if (submitButton) {
            console.log('[TankFarm Scraper] Found submit button, clicking directly...');
            await submitButton.click();
            submitted = true;
          }
        } catch (e) {
          console.log('[TankFarm Scraper] Direct button click failed:', e);
        }
      }
      
      // Method 3: Trigger form submit via requestSubmit (respects validation)
      if (!submitted) {
        try {
          const didSubmit = await page.evaluate(() => {
            const form = document.querySelector('form');
            if (form && typeof form.requestSubmit === 'function') {
              form.requestSubmit();
              return true;
            }
            return false;
          });
          if (didSubmit) {
            console.log('[TankFarm Scraper] Submitted form via requestSubmit');
            submitted = true;
          }
        } catch (e) {
          console.log('[TankFarm Scraper] requestSubmit failed:', e);
        }
      }
      
      // Method 4: Press Enter in password field
      if (!submitted) {
        console.log('[TankFarm Scraper] Using Enter key as fallback...');
        await passwordField.focus();
        await passwordField.press('Enter');
        submitted = true;
      }
      
      // Wait for AJAX request to process
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Wait for dashboard using multiple detection strategies
      console.log('[TankFarm Scraper] Waiting for login to complete and dashboard to load...');
      
      const maxWaitTime = 45000; // 45 seconds max (AJAX apps can be slow)
      const startTime = Date.now();
      let dashboardLoaded = false;
      let lastLoggedUrl = '';
      
      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const currentUrl = page.url();
        
        // Log URL changes for debugging
        if (currentUrl !== lastLoggedUrl) {
          console.log(`[TankFarm Scraper] Current URL: ${currentUrl}`);
          lastLoggedUrl = currentUrl;
        }
        
        // Strategy 1: Check for URL navigation away from sign-in
        const isOnSignInPage = currentUrl.includes('/auth/sign_in');
        
        // Strategy 2: Check for AJAX-based dashboard content (SPA might not change URL)
        const pageState = await page.evaluate(() => {
          const bodyText = document.body.innerText.toLowerCase();
          const bodyHTML = document.body.innerHTML.toLowerCase();
          
          // Check for error messages first
          const errorElements = Array.from(document.querySelectorAll('[class*="error"], [class*="alert"], .flash-error, [class*="danger"]'));
          for (const el of errorElements) {
            const text = el.textContent?.toLowerCase() || '';
            if (text.includes('invalid') || text.includes('incorrect') || text.includes('failed') || 
                text.includes('unauthorized') || text.includes('wrong password')) {
              return { hasError: true, errorText: text, hasDashboard: false };
            }
          }
          
          // Dashboard indicators - look for tank monitoring specific content
          const dashboardIndicators = [
            bodyText.includes('tank level') || bodyText.includes('current level'),
            /\d+\.?\d*\s*%/.test(document.body.innerText), // Percentage display
            bodyText.includes('gal') || bodyText.includes('gallon'),
            bodyText.includes('capacity') || bodyText.includes('remaining'),
            bodyText.includes('last update') || bodyText.includes('updated'),
            bodyText.includes('tank') && (bodyText.includes('level') || bodyText.includes('monitor')),
            // Look for navigation elements that only appear when logged in
            bodyHTML.includes('sign out') || bodyHTML.includes('log out') || bodyHTML.includes('logout'),
            bodyHTML.includes('/dashboard') || bodyHTML.includes('data-dashboard'),
            // Look for tank ID or device identifiers
            bodyHTML.includes('tank-id') || bodyHTML.includes('device-id'),
          ];
          
          const matchCount = dashboardIndicators.filter(Boolean).length;
          
          // Also check if the login form is still present
          const hasLoginForm = !!document.querySelector('input[type="password"]') && 
                               !!document.querySelector('input[type="email"]');
          
          return {
            hasError: false,
            errorText: null,
            hasDashboard: matchCount >= 2,
            matchCount,
            hasLoginForm,
            hasLogoutLink: bodyHTML.includes('sign out') || bodyHTML.includes('log out')
          };
        });
        
        // Handle login errors
        if (pageState.hasError) {
          throw new Error(`Login failed: ${pageState.errorText}`);
        }
        
        // Success case 1: URL changed away from sign-in AND dashboard content present
        if (!isOnSignInPage && pageState.hasDashboard) {
          console.log(`[TankFarm Scraper] ✓ Dashboard detected (${pageState.matchCount} indicators) at ${currentUrl}`);
          dashboardLoaded = true;
          break;
        }
        
        // Success case 2: Still on same URL but dashboard content appeared (SPA behavior)
        if (pageState.hasDashboard && !pageState.hasLoginForm) {
          console.log(`[TankFarm Scraper] ✓ Dashboard content detected via SPA (${pageState.matchCount} indicators)`);
          dashboardLoaded = true;
          break;
        }
        
        // Success case 3: Logout link appeared (definitive sign of being logged in)
        if (pageState.hasLogoutLink && !pageState.hasLoginForm) {
          console.log('[TankFarm Scraper] ✓ Logout link detected - user is logged in');
          // Give it a moment to load dashboard content
          await new Promise(resolve => setTimeout(resolve, 3000));
          dashboardLoaded = true;
          break;
        }
        
        // Still waiting - log progress
        if (isOnSignInPage) {
          console.log(`[TankFarm Scraper] Still on sign-in page (${Math.round((Date.now() - startTime) / 1000)}s elapsed)...`);
        } else {
          console.log(`[TankFarm Scraper] On ${currentUrl} but waiting for dashboard content...`);
        }
      }
      
      if (!dashboardLoaded) {
        const currentUrl = page.url();
        
        // Save diagnostic screenshot and HTML
        try {
          const debugScreenshot = await page.screenshot({ encoding: 'base64', fullPage: true });
          await this.saveDebugScreenshot(debugScreenshot, 'login_failed');
          
          // Also save the HTML for debugging
          const html = await page.content();
          const fs = await import('fs/promises');
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          await fs.writeFile(`/tmp/debug_login_failed_${timestamp}.html`, html);
          console.log('[TankFarm Scraper] Saved diagnostic screenshot and HTML for login failure');
        } catch (e) {
          console.warn('[TankFarm Scraper] Could not save diagnostics:', e);
        }
        
        if (currentUrl.includes('/auth/sign_in')) {
          throw new Error('Login failed - still on sign-in page after 45 seconds. Check credentials or try again later.');
        } else {
          throw new Error(`Login may have succeeded but dashboard not detected after 45s. URL: ${currentUrl}`);
        }
      }
      
      console.log('[TankFarm Scraper] Login complete, ready to extract data');
      
    } catch (error) {
      console.error('[TankFarm Scraper] Login failed:', error);
      throw error;
    }
  }

  /**
   * Save a debug screenshot to disk for troubleshooting
   */
  private async saveDebugScreenshot(base64Screenshot: string, label: string): Promise<string | null> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `debug_${label}_${timestamp}.png`;
      const filepath = path.join('/tmp', filename);
      
      await fs.writeFile(filepath, Buffer.from(base64Screenshot, 'base64'));
      console.log(`[TankFarm Scraper] Debug screenshot saved: ${filepath}`);
      return filepath;
    } catch (error) {
      console.error('[TankFarm Scraper] Failed to save debug screenshot:', error);
      return null;
    }
  }

  /**
   * Extract timestamp directly from DOM (more reliable than AI vision)
   */
  private async extractTimestampFromDOM(page: Page): Promise<Date | null> {
    try {
      const timestamp = await page.evaluate(() => {
        // Look for "Last Update" or similar text patterns
        const searchPatterns = [
          /Last\s+Update[:\s]+(.+?)(?:\n|$|<)/i,
          /Updated[:\s]+(.+?)(?:\n|$|<)/i,
          /As\s+of[:\s]+(.+?)(?:\n|$|<)/i,
        ];

        // Search all text nodes
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          null
        );

        let node;
        while (node = walker.nextNode()) {
          const text = node.textContent || '';
          for (const pattern of searchPatterns) {
            const match = text.match(pattern);
            if (match) {
              console.log(`Found timestamp text: "${match[0]}"`);
              return match[1].trim();
            }
          }
        }

        return null;
      });

      if (!timestamp) {
        return null;
      }

      // Parse the timestamp string
      const parsed = new Date(timestamp);
      if (!isNaN(parsed.getTime())) {
        console.log(`[TankFarm Scraper] DOM parsed timestamp: ${timestamp} -> ${parsed.toISOString()}`);
        return parsed;
      }

      console.warn(`[TankFarm Scraper] Could not parse DOM timestamp: "${timestamp}"`);
      return null;
    } catch (error) {
      console.error('[TankFarm Scraper] DOM timestamp extraction failed:', error);
      return null;
    }
  }

  /**
   * Extract just the timestamp using AI vision (fallback method, less reliable)
   */
  private async extractTimestamp(screenshot: string): Promise<Date | null> {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini", // Use mini for faster/cheaper timestamp check
        messages: [
          {
            role: "user",
            content: [
              { 
                type: "text", 
                text: `Extract the timestamp showing when the TANK LEVEL DATA was last updated from this dashboard.

IMPORTANT: Look for:
- "Updated" or "Last Updated" near the tank level/percentage
- "As of [date]" near the current readings
- A timestamp showing when the current tank readings were measured

DO NOT extract:
- Last delivery date (this is different from when data was updated)
- Account creation date
- Billing dates
- Historical dates

Return a JSON object:
{
  "lastUpdate": "ISO date string",
  "confidence": "high/medium/low - how confident you are this is the data update timestamp"
}

If you cannot find a clear "data last updated" timestamp, return null for lastUpdate.
IMPORTANT: Do NOT make up dates. Only extract what is clearly visible.` 
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${screenshot}`,
                  detail: "low" // Low detail for faster processing
                },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 150,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return null;
      }

      const data = JSON.parse(content);
      console.log('[TankFarm Scraper] AI timestamp extraction result:', data);
      
      if (data.lastUpdate) {
        const timestamp = new Date(data.lastUpdate);
        console.log(`[TankFarm Scraper] Extracted timestamp: ${timestamp.toISOString()} (confidence: ${data.confidence || 'unknown'})`);
        
        // If confidence is low, log a warning
        if (data.confidence === 'low') {
          console.warn('[TankFarm Scraper] Warning: AI has low confidence in extracted timestamp - proceeding with full scrape');
          return null; // Don't use low confidence timestamps for deduplication
        }
        
        return timestamp;
      }
      return null;
    } catch (error) {
      console.error('[TankFarm Scraper] Failed to extract timestamp:', error);
      return null;
    }
  }

  /**
   * Extract historical delivery and payment data from Billing tab
   */
  private async extractHistoricalData(page: Page): Promise<{ deliveries: InsertDelivery[], payments: InsertPayment[] }> {
    const deliveries: InsertDelivery[] = [];
    const payments: InsertPayment[] = [];

    try {
      // Look for Billing tab/link/button
      console.log('[TankFarm Scraper] Looking for Billing tab...');
      const billingClicked = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('a, button, [role="tab"], [role="button"], nav a'));
        for (const elem of elements) {
          const text = elem.textContent?.toLowerCase() || '';
          const ariaLabel = elem.getAttribute('aria-label')?.toLowerCase() || '';
          const href = elem.getAttribute('href')?.toLowerCase() || '';
          
          if (text.includes('billing') || text.includes('invoice') || text.includes('payment') ||
              ariaLabel.includes('billing') || ariaLabel.includes('invoice') || 
              href.includes('billing') || href.includes('invoice')) {
            console.log('Found billing link:', elem.textContent);
            (elem as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (billingClicked) {
        console.log('[TankFarm Scraper] Clicked Billing tab, waiting for data to load...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        const billingScreenshot = await page.screenshot({ 
          encoding: 'base64',
          fullPage: true 
        });

        const pageHTML = await page.content();

        console.log('[TankFarm Scraper] Extracting billing/payment history using AI vision...');
        const historicalData = await this.extractDataWithVision(billingScreenshot, pageHTML, 'history');
        
        if (historicalData.deliveries) {
          deliveries.push(...historicalData.deliveries);
        }
        if (historicalData.payments) {
          payments.push(...historicalData.payments);
        }
      } else {
        console.log('[TankFarm Scraper] Could not find Billing tab - historical data will not be scraped');
      }
    } catch (error) {
      console.log('[TankFarm Scraper] Could not extract historical data:', error);
    }

    return { deliveries, payments };
  }

  /**
   * Use GPT-4 Vision to extract data from screenshot with DOM validation
   */
  private async extractDataWithVision(screenshot: string, htmlContent: string, extractionType: 'current' | 'history'): Promise<TankFarmData> {
    const prompt = extractionType === 'current' 
      ? `You are analyzing a screenshot of a propane/heating oil tank monitoring dashboard from tankfarm.io.

Extract the following information from the DASHBOARD PAGE and return it as a JSON object:

{
  "tankReading": {
    "levelPercentage": "string - current tank level as percentage (e.g., '65.12')",
    "remainingGallons": "string - remaining gallons in tank (e.g., '78.2')",
    "tankCapacity": "string - total tank capacity in gallons (e.g., '120')",
    "pricePerGallon": "string - current price per gallon (e.g., '2.68')",
    "lastUpdate": "ISO date string - when the TANK LEVEL readings were last updated (NOT the delivery date)"
  },
  "lastDelivery": {
    "deliveryDate": "ISO date string - date of the most recent delivery shown on dashboard (e.g., '2025-11-01')",
    "amountGallons": "string - gallons delivered in most recent delivery (e.g., '95.5')"
  }
}

CRITICAL RULES FOR DASHBOARD EXTRACTION:
- Extract numbers only, without units or $ symbols
- Return null for any field that cannot be found - DO NOT GUESS OR USE DEFAULTS
- For lastUpdate: Look for "Updated", "Last Updated", or "As of" near the tank level readings
- IMPORTANT: lastUpdate is when readings were measured, NOT when fuel was delivered
- Do NOT use the delivery date as the lastUpdate - these are two different dates
- Look for "Last Delivery" or "Most Recent Delivery" section on the dashboard
- Be precise with decimal numbers
- Validate that percentages are between 0-100 and gallons are positive numbers
- If last delivery info is not visible on dashboard, return null for those fields`
      : `You are analyzing a screenshot of delivery and payment history from tankfarm.io.

Extract ALL deliveries and payments visible and return as a JSON object:

{
  "deliveries": [
    {
      "deliveryDate": "ISO date string",
      "amountGallons": "string - gallons delivered",
      "pricePerGallon": "string - price per gallon at delivery",
      "totalCost": "string - total cost of delivery"
    }
  ],
  "payments": [
    {
      "paymentDate": "ISO date string",
      "amount": "string - payment amount",
      "paymentMethod": "string - card type and last 4 digits",
      "status": "string - 'paid' or 'pending'"
    }
  ]
}

CRITICAL RULES:
- Extract ALL visible deliveries and payments, not just the most recent
- Extract numbers only, without $ or units
- Parse dates carefully from the UI
- Return empty arrays if no data is visible
- DO NOT MAKE UP DATA - only extract what you can clearly see`;

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${screenshot}`,
                  detail: "high"
                },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from OpenAI");
      }

      const extractedData = JSON.parse(content);
      console.log('[TankFarm Scraper] AI extracted data:', JSON.stringify(extractedData, null, 2));

      // Validate and transform the extracted data
      if (extractionType === 'current' && extractedData.tankReading) {
        const reading = extractedData.tankReading;
        
        // Validate required fields
        if (!reading.levelPercentage || !reading.remainingGallons || !reading.lastUpdate) {
          throw new Error("Missing required fields in tank reading");
        }

        // Validate ranges
        const level = parseFloat(reading.levelPercentage);
        if (isNaN(level) || level < 0 || level > 100) {
          throw new Error(`Invalid level percentage: ${reading.levelPercentage}`);
        }

        const result: TankFarmData = {
          tankReading: {
            levelPercentage: reading.levelPercentage,
            remainingGallons: reading.remainingGallons,
            tankCapacity: reading.tankCapacity,
            pricePerGallon: reading.pricePerGallon,
            tankfarmLastUpdate: new Date(reading.lastUpdate),
          },
        };

        // If last delivery info is visible on dashboard, add it (only if we have price for cost calculation)
        if (extractedData.lastDelivery && 
            extractedData.lastDelivery.deliveryDate && 
            extractedData.lastDelivery.amountGallons &&
            reading.pricePerGallon) {
          const lastDel = extractedData.lastDelivery;
          result.deliveries = [{
            deliveryDate: new Date(lastDel.deliveryDate),
            amountGallons: lastDel.amountGallons,
            pricePerGallon: reading.pricePerGallon,
            totalCost: (parseFloat(lastDel.amountGallons) * parseFloat(reading.pricePerGallon)).toFixed(2),
          }];
        }

        return result;
      } else if (extractionType === 'history') {
        const deliveries = (extractedData.deliveries || []).map((d: any) => ({
          deliveryDate: new Date(d.deliveryDate),
          amountGallons: d.amountGallons,
          pricePerGallon: d.pricePerGallon,
          totalCost: d.totalCost,
        }));

        const payments = (extractedData.payments || []).map((p: any) => ({
          paymentDate: new Date(p.paymentDate),
          amount: p.amount,
          paymentMethod: p.paymentMethod,
          status: p.status,
        }));

        return {
          tankReading: this.getMockData().tankReading,
          deliveries,
          payments,
        };
      }

      throw new Error("Unexpected extraction type or malformed data");

    } catch (error) {
      console.error('[TankFarm Scraper] Vision extraction failed:', error);
      throw error;
    }
  }

  /**
   * Mock data for development/testing
   */
  private getMockData(): TankFarmData {
    // Simulate realistic changing data
    const baseLevel = 66;
    const variation = Math.random() * 2 - 1;
    const level = Math.max(0, Math.min(100, baseLevel + variation));
    const capacity = 120;
    const remainingGallons = (level / 100) * capacity;

    return {
      tankReading: {
        levelPercentage: level.toFixed(2),
        remainingGallons: remainingGallons.toFixed(2),
        tankCapacity: capacity.toString(),
        pricePerGallon: "2.68",
        tankfarmLastUpdate: new Date(),
      },
      deliveries: [
        {
          deliveryDate: new Date('2025-04-29'),
          amountGallons: "72.8",
          pricePerGallon: "2.68",
          totalCost: "195.10",
        }
      ],
      payments: [
        {
          paymentDate: new Date('2025-04-29'),
          amount: "195.10",
          paymentMethod: "Visa •••• 4242",
          status: "paid",
        }
      ],
    };
  }
}

// Singleton instance
export const tankFarmScraper = new TankFarmScraper();
