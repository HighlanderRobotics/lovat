import { test, expect } from '@playwright/test';
import manifest from '../../src/lib/design/manifest.json' with {type:'json'};

test('native index entry opens Home and status-bar insets preserve the form footer', async ({page}) => {
  await page.goto('/index.html');
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:9807');
  await page.goto('/design/5775-10120');
  await page.addStyleTag({content:'.design-viewport {padding-top:64px !important}'});
  await page.evaluate(()=>window.dispatchEvent(new Event('resize')));
  await expect(page.locator('.design-frame')).toHaveCSS('height','788px');
  const footer = await page.getByRole('button',{name:'Create form',exact:true}).boundingBox();
  expect(footer!.y + footer!.height).toBeLessThanOrEqual(852);
});

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
      return !img.naturalWidth || (!img.closest('[data-layout-role="system"]') && (!rect.width || !rect.height)) || !img.src.includes('/design-assets/');
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

test('mobile footers and navbar stay anchored while content scrolls', async ({page}) => {
  for(const height of [667,844,932]) {
    await page.setViewportSize({width:393,height});
    for(const id of ['5775-9807','5775-10120','5775-10069','5775-14720']) {
      await page.goto(`/design/${id}`);
      const anchors=page.locator('[data-layout-role="nav"], [data-layout-role="footer"]');
      await expect(anchors.first()).toBeVisible();
      const before=await anchors.evaluateAll(elements=>elements.map(e=>{const r=e.getBoundingClientRect();return {y:r.y,bottom:r.bottom};}));
      for(const box of before) {expect(box.bottom).toBeLessThanOrEqual(height+.5);expect(box.bottom).toBeGreaterThan(height-125);}
      await page.locator('[data-layout-role="body"]').evaluate(e=>{e.scrollTop=10000;});
      const after=await anchors.evaluateAll(elements=>elements.map(e=>{const r=e.getBoundingClientRect();return {y:r.y,bottom:r.bottom};}));
      expect(after).toEqual(before);
    }
  }
});

test('mobile zoom gestures are blocked and ordinary touch scrolling is preserved', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content',/maximum-scale=1.*user-scalable=no/);
  const result=await page.evaluate(()=>{
    const gesture=new Event('gesturestart',{cancelable:true,bubbles:true});
    document.dispatchEvent(gesture);
    function touch(count:number){
      const event=new Event('touchmove',{cancelable:true,bubbles:true});
      Object.defineProperty(event,'touches',{value:Array(count).fill({})});
      document.dispatchEvent(event);return event.defaultPrevented;
    }
    return [gesture.defaultPrevented,touch(2),touch(1)];
  });
  expect(result).toEqual([true,true,false]);
});

test('screen navigation animates and respects reduced motion', async ({page}) => {
  for(const reduced of [false,true]) {
    await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
    await page.goto('/');
    await page.evaluate(()=>{
      const original=document.startViewTransition.bind(document);
      (window as unknown as {transitions:number}).transitions=0;
      document.startViewTransition=((update:()=>Promise<void>)=>{
        (window as unknown as {transitions:number}).transitions++;
        return original(update);
      }) as typeof document.startViewTransition;
    });
    await page.locator('[data-design-name="TabBarItem"]').filter({hasText:'Forms'}).click();
    await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:10069');
    expect(await page.evaluate(()=>(window as unknown as {transitions:number}).transitions)).toBe(reduced?0:1);
  }
});
