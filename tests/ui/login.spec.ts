import { test, expect } from '../../src/fixtures/baseTest';

test('successful login', async ({ loginPage }) => {
  await loginPage.goto();
  await loginPage.login('student', 'Password123');
  await loginPage.verifyLoginSuccess();
});

test('failed login - wrong password', async ({ loginPage }) => {
  await loginPage.goto();
  await loginPage.login('student', 'wrongpassword');
  await loginPage.verifyLoginFailure('Your password is invalid!');
});