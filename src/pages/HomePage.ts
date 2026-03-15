import { Page, Locator, expect } from '@playwright/test';

export class HomePage {
  readonly page: Page;
  readonly heading: Locator;
  readonly navLinks: Locator;
  readonly practiceLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('h1').first();
    this.navLinks = page.locator('nav a');
    this.practiceLink = page.locator('a[href*="practice"]').first();
  }

  async goto() {
    await this.page.goto('/');
  }

  async verifyHeadingVisible() {
    await expect(this.heading).toBeVisible();
  }

  async verifyTitle(expected: string) {
    await expect(this.page).toHaveTitle(expected);
  }

  async verifyNavLinksExist() {
    await expect(this.navLinks).not.toHaveCount(0);
  }

  async verifyPracticeLinkVisible() {
    await expect(this.practiceLink).toBeVisible();
  }
}
