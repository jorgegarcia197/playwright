/**
 * Copyright 2018 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const {FFOX, CHROMIUM, WEBKIT, WIN} = require('./utils').testOptions(browserType);

describe('BrowserContext.cookies', function() {
  it('should return no cookies in pristine browser context', async({context, page, server}) => {
    expect(await context.cookies()).toEqual([]);
  });
  it('should get a cookie', async({context, page, server}) => {
    await page.goto(server.EMPTY_PAGE);
    await page.evaluate(() => {
      document.cookie = 'username=John Doe';
    });
    expect(await context.cookies()).toEqual([{
      name: 'username',
      value: 'John Doe',
      domain: 'localhost',
      path: '/',
      expires: -1,
      httpOnly: false,
      secure: false,
      sameSite: 'None',
    }]);
  });
  it('should get a non-session cookie', async({context, page, server}) => {
    await page.goto(server.EMPTY_PAGE);
    // @see https://en.wikipedia.org/wiki/Year_2038_problem
    const date = +(new Date('1/1/2038'));
    await page.evaluate(timestamp => {
      const date = new Date(timestamp);
      document.cookie = `username=John Doe;expires=${date.toUTCString()}`;
    }, date);
    expect(await context.cookies()).toEqual([{
      name: 'username',
      value: 'John Doe',
      domain: 'localhost',
      path: '/',
      expires: date / 1000,
      httpOnly: false,
      secure: false,
      sameSite: 'None',
    }]);
  });
  it('should properly report httpOnly cookie', async({context, page, server}) => {
    server.setRoute('/empty.html', (req, res) => {
      res.setHeader('Set-Cookie', 'name=value;HttpOnly; Path=/');
      res.end();
    });
    await page.goto(server.EMPTY_PAGE);
    const cookies = await context.cookies();
    expect(cookies.length).toBe(1);
    expect(cookies[0].httpOnly).toBe(true);
  });
  it.fail(WEBKIT && WIN)('should properly report "Strict" sameSite cookie', async({context, page, server}) => {
    server.setRoute('/empty.html', (req, res) => {
      res.setHeader('Set-Cookie', 'name=value;SameSite=Strict');
      res.end();
    });
    await page.goto(server.EMPTY_PAGE);
    const cookies = await context.cookies();
    expect(cookies.length).toBe(1);
    expect(cookies[0].sameSite).toBe('Strict');
  });
  it.fail(WEBKIT && WIN)('should properly report "Lax" sameSite cookie', async({context, page, server}) => {
    server.setRoute('/empty.html', (req, res) => {
      res.setHeader('Set-Cookie', 'name=value;SameSite=Lax');
      res.end();
    });
    await page.goto(server.EMPTY_PAGE);
    const cookies = await context.cookies();
    expect(cookies.length).toBe(1);
    expect(cookies[0].sameSite).toBe('Lax');
  });
  it('should get multiple cookies', async({context, page, server}) => {
    await page.goto(server.EMPTY_PAGE);
    const documentCookie = await page.evaluate(() => {
      document.cookie = 'username=John Doe';
      document.cookie = 'password=1234';
      return document.cookie.split('; ').sort().join('; ');
    });
    const cookies = await context.cookies();
    cookies.sort((a, b) => a.name.localeCompare(b.name));
    expect(documentCookie).toBe('password=1234; username=John Doe');
    expect(cookies).toEqual([
      {
        name: 'password',
        value: '1234',
        domain: 'localhost',
        path: '/',
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: 'None',
      },
      {
        name: 'username',
        value: 'John Doe',
        domain: 'localhost',
        path: '/',
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: 'None',
      },
    ]);
  });
  it('should get cookies from multiple urls', async({context}) => {
    await context.addCookies([{
      url: 'https://foo.com',
      name: 'doggo',
      value: 'woofs',
    }, {
      url: 'https://bar.com',
      name: 'catto',
      value: 'purrs',
    }, {
      url: 'https://baz.com',
      name: 'birdo',
      value: 'tweets',
    }]);
    const cookies = await context.cookies(['https://foo.com', 'https://baz.com']);
    cookies.sort((a, b) => a.name.localeCompare(b.name));
    expect(cookies).toEqual([{
      name: 'birdo',
      value: 'tweets',
      domain: 'baz.com',
      path: '/',
      expires: -1,
      httpOnly: false,
      secure: true,
      sameSite: 'None',
    }, {
      name: 'doggo',
      value: 'woofs',
      domain: 'foo.com',
      path: '/',
      expires: -1,
      httpOnly: false,
      secure: true,
      sameSite: 'None',
    }]);
  });
});

describe('BrowserContext.addCookies', function() {
  it('should work', async({context, page, server}) => {
    await page.goto(server.EMPTY_PAGE);
    await context.addCookies([{
      url: server.EMPTY_PAGE,
      name: 'password',
      value: '123456'
    }]);
    expect(await page.evaluate(() => document.cookie)).toEqual('password=123456');
  });
  it('should roundtrip cookie', async({context, page, server}) => {
    await page.goto(server.EMPTY_PAGE);
    // @see https://en.wikipedia.org/wiki/Year_2038_problem
    const date = +(new Date('1/1/2038'));
    await page.evaluate(timestamp => {
      const date = new Date(timestamp);
      document.cookie = `username=John Doe;expires=${date.toUTCString()}`;
    }, date);
    const cookies = await context.cookies();
    await context.clearCookies();
    expect(await context.cookies()).toEqual([]);
    await context.addCookies(cookies);
    expect(await context.cookies()).toEqual(cookies);
  });
  it('should send cookie header', async({server, context}) => {
    let cookie = '';
    server.setRoute('/empty.html', (req, res) => {
      cookie = req.headers.cookie;
      res.end();
    });
    await context.addCookies([{url: server.EMPTY_PAGE, name: 'cookie', value: 'value'}]);
    const page = await context.newPage();
    await page.goto(server.EMPTY_PAGE);
    expect(cookie).toBe('cookie=value');
  });
  it('should isolate cookies in browser contexts', async({context, server, browser}) => {
    const anotherContext = await browser.newContext();
    await context.addCookies([{url: server.EMPTY_PAGE, name: 'isolatecookie', value: 'page1value'}]);
    await anotherContext.addCookies([{url: server.EMPTY_PAGE, name: 'isolatecookie', value: 'page2value'}]);

    const cookies1 = await context.cookies();
    const cookies2 = await anotherContext.cookies();
    expect(cookies1.length).toBe(1);
    expect(cookies2.length).toBe(1);
    expect(cookies1[0].name).toBe('isolatecookie');
    expect(cookies1[0].value).toBe('page1value');
    expect(cookies2[0].name).toBe('isolatecookie');
    expect(cookies2[0].value).toBe('page2value');
    await anotherContext.close();
  });
  it('should isolate session cookies', async({context, server, browser}) => {
    server.setRoute('/setcookie.html', (req, res) => {
      res.setHeader('Set-Cookie', 'session=value');
      res.end();
    });
    {
      const page = await context.newPage();
      await page.goto(server.PREFIX + '/setcookie.html');
    }
    {
      const page = await context.newPage();
      await page.goto(server.EMPTY_PAGE);
      const cookies = await context.cookies();
      expect(cookies.length).toBe(1);
      expect(cookies.map(c => c.value).join(',')).toBe('value');
    }
    {
      const context2 = await browser.newContext();
      const page = await context2.newPage();
      await page.goto(server.EMPTY_PAGE);
      const cookies = await context2.cookies();
      expect(cookies[0] && cookies[0].name).toBe(undefined);
      await context2.close();
    }
  });
  it('should isolate persistent cookies', async({context, server, browser}) => {
    server.setRoute('/setcookie.html', (req, res) => {
      res.setHeader('Set-Cookie', 'persistent=persistent-value; max-age=3600');
      res.end();
    });
    const page = await context.newPage();
    await page.goto(server.PREFIX + '/setcookie.html');

    const context1 = context;
    const context2 = await browser.newContext();
    const [page1, page2] = await Promise.all([context1.newPage(), context2.newPage()]);
    await Promise.all([page1.goto(server.EMPTY_PAGE), page2.goto(server.EMPTY_PAGE)]);
    const [cookies1, cookies2] = await Promise.all([context1.cookies(), context2.cookies()]);
    expect(cookies1.length).toBe(1);
    expect(cookies1[0].name).toBe('persistent');
    expect(cookies1[0].value).toBe('persistent-value');
    expect(cookies2.length).toBe(0);
    await context2.close();
  });
  it('should isolate send cookie header', async({server, context, browser}) => {
    let cookie = [];
    server.setRoute('/empty.html', (req, res) => {
      cookie = req.headers.cookie || '';
      res.end();
    });
    await context.addCookies([{url: server.EMPTY_PAGE, name: 'sendcookie', value: 'value'}]);
    {
      const page = await context.newPage();
      await page.goto(server.EMPTY_PAGE);
      expect(cookie).toBe('sendcookie=value');
    }
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(server.EMPTY_PAGE);
      expect(cookie).toBe('');
      await context.close();
    }
  });
  it.slow()('should isolate cookies between launches', async({browserType, server, defaultBrowserOptions}) => {
    const browser1 = await browserType.launch(defaultBrowserOptions);
    const context1 = await browser1.newContext();
    await context1.addCookies([{url: server.EMPTY_PAGE, name: 'cookie-in-context-1', value: 'value', expires: Date.now() / 1000 + 10000}]);
    await browser1.close();

    const browser2 = await browserType.launch(defaultBrowserOptions);
    const context2 = await browser2.newContext();
    const cookies = await context2.cookies();
    expect(cookies.length).toBe(0);
    await browser2.close();
  });
  it('should set multiple cookies', async({context, page, server}) => {
    await page.goto(server.EMPTY_PAGE);
    await context.addCookies([{
      url: server.EMPTY_PAGE,
      name: 'multiple-1',
      value: '123456'
    }, {
      url: server.EMPTY_PAGE,
      name: 'multiple-2',
      value: 'bar'
    }]);
    expect(await page.evaluate(() => {
      const cookies = document.cookie.split(';');
      return cookies.map(cookie => cookie.trim()).sort();
    })).toEqual([
      'multiple-1=123456',
      'multiple-2=bar',
    ]);
  });
  it('should have |expires| set to |-1| for session cookies', async({context, server}) => {
    await context.addCookies([{
      url: server.EMPTY_PAGE,
      name: 'expires',
      value: '123456'
    }]);
    const cookies = await context.cookies();
    expect(cookies[0].expires).toBe(-1);
  });
  it('should set cookie with reasonable defaults', async({context, server}) => {
    await context.addCookies([{
      url: server.EMPTY_PAGE,
      name: 'defaults',
      value: '123456'
    }]);
    const cookies = await context.cookies();
    expect(cookies.sort((a, b) => a.name.localeCompare(b.name))).toEqual([{
      name: 'defaults',
      value: '123456',
      domain: 'localhost',
      path: '/',
      expires: -1,
      httpOnly: false,
      secure: false,
      sameSite: 'None',
    }]);
  });
  it('should set a cookie with a path', async({context, page, server}) => {
    await page.goto(server.PREFIX + '/grid.html');
    await context.addCookies([{
      domain: 'localhost',
      path: '/grid.html',
      name: 'gridcookie',
      value: 'GRID',
    }]);
    expect(await context.cookies()).toEqual([{
      name: 'gridcookie',
      value: 'GRID',
      domain: 'localhost',
      path: '/grid.html',
      expires: -1,
      httpOnly: false,
      secure: false,
      sameSite: 'None',
    }]);
    expect(await page.evaluate('document.cookie')).toBe('gridcookie=GRID');
    await page.goto(server.EMPTY_PAGE);
    expect(await page.evaluate('document.cookie')).toBe('');
    await page.goto(server.PREFIX + '/grid.html');
    expect(await page.evaluate('document.cookie')).toBe('gridcookie=GRID');
  });
  it('should not set a cookie with blank page URL', async function({context, server}) {
    let error = null;
    try {
      await context.addCookies([
          {url: server.EMPTY_PAGE, name: 'example-cookie', value: 'best'},
          {url: 'about:blank', name: 'example-cookie-blank', value: 'best'}
      ]);
    } catch (e) {
      error = e;
    }
    expect(error.message).toEqual(
        `Blank page can not have cookie "example-cookie-blank"`
    );
  });
  it('should not set a cookie on a data URL page', async function({context}) {
    let error = null;
    try {
      await context.addCookies([{url: 'data:,Hello%2C%20World!', name: 'example-cookie', value: 'best'}]);
    } catch (e) {
      error = e;
    }
    expect(error.message).toContain('Data URL page can not have cookie "example-cookie"');
  });
  it('should default to setting secure cookie for HTTPS websites', async({context, page, server}) => {
    await page.goto(server.EMPTY_PAGE);
    const SECURE_URL = 'https://example.com';
    await context.addCookies([{
      url: SECURE_URL,
      name: 'foo',
      value: 'bar',
    }]);
    const [cookie] = await context.cookies(SECURE_URL);
    expect(cookie.secure).toBe(true);
  });
  it('should be able to set unsecure cookie for HTTP website', async({context, page, server}) => {
    await page.goto(server.EMPTY_PAGE);
    const HTTP_URL = 'http://example.com';
    await context.addCookies([{
      url: HTTP_URL,
      name: 'foo',
      value: 'bar',
    }]);
    const [cookie] = await context.cookies(HTTP_URL);
    expect(cookie.secure).toBe(false);
  });
  it('should set a cookie on a different domain', async({context, page, server}) => {
    await page.goto(server.EMPTY_PAGE);
    await context.addCookies([{
      url: 'https://www.example.com',
      name: 'example-cookie',
      value: 'best',
    }]);
    expect(await page.evaluate('document.cookie')).toBe('');
    expect(await context.cookies('https://www.example.com')).toEqual([{
      name: 'example-cookie',
      value: 'best',
      domain: 'www.example.com',
      path: '/',
      expires: -1,
      httpOnly: false,
      secure: true,
      sameSite: 'None',
    }]);
  });
  it('should set cookies for a frame', async({context, page, server}) => {
    await page.goto(server.EMPTY_PAGE);
    await context.addCookies([
      {url: server.PREFIX, name: 'frame-cookie', value: 'value'}
    ]);
    await page.evaluate(src => {
      let fulfill;
      const promise = new Promise(x => fulfill = x);
      const iframe = document.createElement('iframe');
      document.body.appendChild(iframe);
      iframe.onload = fulfill;
      iframe.src = src;
      return promise;
    }, server.PREFIX + '/grid.html');

    expect(await page.frames()[1].evaluate('document.cookie')).toBe('frame-cookie=value');
  });
  it('should(not) block third party cookies', async({context, page, server}) => {
    await page.goto(server.EMPTY_PAGE);
    await page.evaluate(src => {
      let fulfill;
      const promise = new Promise(x => fulfill = x);
      const iframe = document.createElement('iframe');
      document.body.appendChild(iframe);
      iframe.onload = fulfill;
      iframe.src = src;
      return promise;
    }, server.CROSS_PROCESS_PREFIX + '/grid.html');
    await page.frames()[1].evaluate(`document.cookie = 'username=John Doe'`);
    await page.waitForTimeout(2000);
    const allowsThirdParty = CHROMIUM || FFOX;
    const cookies = await context.cookies(server.CROSS_PROCESS_PREFIX + '/grid.html');
    if (allowsThirdParty) {
      expect(cookies).toEqual([
        {
          "domain": "127.0.0.1",
          "expires": -1,
          "httpOnly": false,
          "name": "username",
          "path": "/",
          "sameSite": "None",
          "secure": false,
          "value": "John Doe"
        }
      ]);
    } else {
      expect(cookies).toEqual([]);
    }
  });
});

describe('BrowserContext.clearCookies', function() {
  it('should clear cookies', async({context, page, server}) => {
    await page.goto(server.EMPTY_PAGE);
    await context.addCookies([{
      url: server.EMPTY_PAGE,
      name: 'cookie1',
      value: '1'
    }]);
    expect(await page.evaluate('document.cookie')).toBe('cookie1=1');
    await context.clearCookies();
    expect(await context.cookies()).toEqual([]);
    await page.reload();
    expect(await page.evaluate('document.cookie')).toBe('');
  });
  it('should isolate cookies when clearing', async({context, server, browser}) => {
    const anotherContext = await browser.newContext();
    await context.addCookies([{url: server.EMPTY_PAGE, name: 'page1cookie', value: 'page1value'}]);
    await anotherContext.addCookies([{url: server.EMPTY_PAGE, name: 'page2cookie', value: 'page2value'}]);

    expect((await context.cookies()).length).toBe(1);
    expect((await anotherContext.cookies()).length).toBe(1);

    await context.clearCookies();
    expect((await context.cookies()).length).toBe(0);
    expect((await anotherContext.cookies()).length).toBe(1);

    await anotherContext.clearCookies();
    expect((await context.cookies()).length).toBe(0);
    expect((await anotherContext.cookies()).length).toBe(0);
    await anotherContext.close();
  });
});
