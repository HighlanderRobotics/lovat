import { test, expect } from '@playwright/test';
import manifest from '../../src/lib/design/manifest.json' with {type:'json'};

test('all Figma states render with local, loaded images and no browser errors', async ({page}) => {
  const errors: string[] = [];
  const remoteRequests: string[] = [];
  page.on('request', request => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:1430/')) remoteRequests.push(request.url());
  });
  page.on('pageerror', error => errors.push(error.message));
  expect(manifest).toHaveLength(91);
  for (const frame of manifest) {
    await page.goto(`/design/${frame.id.replace(':','-')}`);
    await expect(page.locator('.design-frame [data-figma-node]').first(), frame.id).toBeVisible({timeout:15000});
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(image=>image.decode()));
    });
    const broken = await page.locator('.design-frame img').evaluateAll(images => images.filter(image => {
      const img = image as HTMLImageElement;
      const rect = img.getBoundingClientRect();
      return !img.naturalWidth || !rect.width || !rect.height || !img.src.includes('/design-assets/');
    }).length);
    expect(broken, frame.id).toBe(0);
  }
  expect(errors).toEqual([]);
  expect(remoteRequests).toEqual([]);
});

test('create-form choices stay exclusive and support a form from scratch', async ({page}) => {
  await page.goto('/design/5775-10120');
  await page.getByRole('radio',{name:'Create your own Make your own form from scratch'}).click();
  const team = page.getByRole('radio',{name:'Team Typically used for pit scouting'});
  const match = page.getByRole('radio',{name:'Team in a match For observations about a single robot during a single match'});
  const alliance = page.getByRole('radio',{name:'Alliance in a match For observations about an alliance during a single match'});
  await match.click();
  await expect(match).toHaveAttribute('aria-checked','true');
  await expect(team).toHaveAttribute('aria-checked','false');
  await expect(alliance).toHaveAttribute('aria-checked','false');
  await alliance.click();
  await expect(alliance).toHaveAttribute('aria-checked','true');
  await expect(match).toHaveAttribute('aria-checked','false');
  await page.getByRole('button',{name:'Create form',exact:true}).click();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:10144');
});

test('Home opens Forms, a template, and question options', async ({page}) => {
  await page.goto('/');
  await page.locator('[data-design-name="TabBarItem"]').filter({hasText:'Forms'}).click();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:10069');
  await page.getByRole('button',{name:'DCMP Pit Scouting Created by Collin C · 45 responses'}).click();
  await page.getByRole('button',{name:'Add new question',exact:true}).click();
  await page.getByRole('button',{name:'Photo',exact:true}).click();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:14284');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:14514');
});

test('API key create, rename, and delete confirmations navigate to their success states', async ({page}) => {
  await page.goto('/design/5775-15322');
  await page.getByRole('button',{name:'Create a new key',exact:true}).click();
  await page.locator('input').last().fill('Local preview');
  await page.getByRole('button',{name:'Create',exact:true}).click();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:15445');
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:15653');
  await page.goto('/design/5775-15503');
  await page.getByRole('button',{name:'Rename key',exact:true}).click();
  await page.getByRole('button',{name:'Rename',exact:true}).click();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:15812');
  await page.goto('/design/5775-15503');
  await page.getByRole('button',{name:'Delete key',exact:true}).click();
  await page.getByRole('button',{name:'Delete',exact:true}).click();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:15712');
});
