import { test, expect } from '../../src/fixtures/baseTest';

test('heading is visible', async ({ homePage }) => {
  await homePage.goto();
  await homePage.verifyHeadingVisible();
});

test('page title is correct', async ({ homePage }) => {
  await homePage.goto();
  await homePage.verifyTitle('Practice Test Automation | Learn Selenium WebDriver');
});

test('navigation links exist', async ({ homePage }) => {
  await homePage.goto();
  await homePage.verifyNavLinksExist();
});

test('practice link is visible', async ({ homePage }) => {
  await homePage.goto();
  await homePage.verifyPracticeLinkVisible();
});

test('wrong title check - intentional fail', async ({ homePage }) => {
  await homePage.goto();
  await expect(homePage.page).toHaveTitle('Wrong Title');
});

test.skip('skipped test example', async ({ homePage }) => {
  await homePage.goto();
  await homePage.verifyHeadingVisible();
});

test('skip conditionally - always skipped', async ({ homePage }) => {
  test.skip(true, 'This feature is not yet implemented');
  await homePage.goto();
});
