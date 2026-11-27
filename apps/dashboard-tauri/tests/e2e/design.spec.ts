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
  await page.getByRole('radio',{name:'Photo',exact:true}).click();
  await expect(page.getByRole('button',{name:'Save changes',exact:true})).toBeEnabled();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:14183');
  await page.getByRole('button',{name:'Options',exact:true}).click();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:14284');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:14514');
});

test('API key create, rename, and delete confirmations navigate to their success states', async ({page}) => {
  await page.goto('/design/5775-15322');
  await page.getByRole('button',{name:'Create a new key',exact:true}).click();
  await page.getByRole('textbox',{name:'Name',exact:true}).fill('Local preview');
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
  await expect(page.locator('[data-layout-role="nav"]')).toBeVisible();
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

test('page swipes keep the dock mounted and respect reduced motion', async ({page}) => {
  for(const reduced of [false,true]) {
    await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
    await page.goto('/');
    await page.locator('[data-layout-role="nav"]').evaluate(e=>(window as unknown as {dock:Element}).dock=e);
    await page.locator('[data-design-name="TabBarItem"]').filter({hasText:'Forms'}).click();
    await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:10069');
    expect(await page.locator('[data-layout-role="nav"]').evaluate(e=>(window as unknown as {dock:Element}).dock===e)).toBe(true);
    expect(await page.locator('.design-dock').evaluate(e=>e.getAnimations({subtree:true}).length)).toBe(0);
    if(!reduced)await expect(page.locator('.design-frame')).toHaveAttribute('data-navigation-direction','forward');
  }
});

test('selectors change values, retain selection, and support bulk selection', async ({page}) => {
  await page.goto('/design/5775-14810');
  const tournaments=page.getByRole('radio');
  await tournaments.nth(2).check();
  await expect(tournaments.nth(2)).toBeChecked();
  await expect(tournaments.first()).not.toBeChecked();
  await page.getByRole('button',{name:'Apply changes',exact:true}).click();
  await page.getByRole('button',{name:/^At tournament/}).click();
  await expect(page.getByRole('radio').nth(2)).toBeChecked();
  await page.goto('/design/5775-15945');
  const teams=page.getByRole('checkbox');
  await teams.nth(1).check();
  await expect(teams.nth(1)).toBeChecked();
  await teams.first().uncheck();
  await expect(teams.first()).not.toBeChecked();
  await page.getByRole('button',{name:'Select all',exact:true}).click();
  expect(await teams.evaluateAll(inputs=>inputs.every(e=>(e as HTMLInputElement).checked))).toBe(true);
  await page.getByRole('button',{name:'Just my team',exact:true}).click();
  expect(await teams.evaluateAll(inputs=>inputs.filter(e=>(e as HTMLInputElement).checked).length)).toBe(1);
});

test('search starts empty, filters Forms, and stays below the header', async ({page}) => {
  await page.goto('/forms');
  const search=page.getByRole('textbox',{name:'Search forms'});
  await expect(search).toHaveValue('');
  await expect(search).toHaveAttribute('placeholder','Search forms');
  const header=await page.locator('[data-figma-node="5775:10088"]').boundingBox();
  const box=await search.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(header!.y+header!.height);
  await search.fill('SF Pit');
  await expect(page.getByRole('button',{name:/^SF Pit Scouting/})).toBeVisible();
  await expect(page.getByRole('button',{name:/^DCMP Pit Scouting/})).toBeHidden();
});

test('checkboxes and required switches update without navigating or remounting', async ({page}) => {
  await page.goto('/design/5775-14879');
  await page.getByRole('checkbox',{name:'Leo K',exact:true}).check();
  await page.getByRole('checkbox',{name:'Jack S',exact:true}).check();
  await expect(page.getByRole('checkbox',{name:'Leo K',exact:true})).toBeChecked();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:14879');
  await page.goto('/design/5775-14284');
  const toggle=page.getByRole('switch',{name:'Required'});
  await toggle.check();await expect(toggle).toBeChecked();
  await toggle.uncheck();await expect(toggle).not.toBeChecked();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:14284');
});

test('confirmation messages disappear after 1.5 seconds', async ({page}) => {
  const now=new Date('2026-11-26T12:00:00Z');
  await page.clock.install({time:now});
  await page.clock.pauseAt(now);
  await page.goto('/design/5775-14514');
  await expect(page.getByText('Updated question',{exact:true})).toBeVisible();
  await page.clock.fastForward(1499);
  await expect(page.getByText('Updated question',{exact:true})).toBeVisible();
  await page.clock.fastForward(1);
  await expect(page.getByText('Updated question',{exact:true})).toBeHidden();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:14514');
});

test('keyboard resizes the scrollable area without squeezing the screen', async ({page}) => {
  await page.goto('/design/5775-10120');
  const height=await page.locator('.design-frame').evaluate(e=>e.getBoundingClientRect().height);
  await page.getByRole('textbox',{name:'Name',exact:true}).focus();
  await page.evaluate(()=>{
    Object.defineProperty(window.visualViewport,'height',{configurable:true,value:500});
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(page.locator('.design-viewport')).toHaveClass(/keyboard-open/);
  expect(await page.locator('.design-frame').evaluate(e=>e.getBoundingClientRect().height)).toBe(height);
  await expect(page.locator('[data-layout-role="footer"]')).toBeHidden();
  await page.getByRole('textbox',{name:'Name',exact:true}).blur();
  await page.evaluate(()=>{Object.defineProperty(window.visualViewport,'height',{configurable:true,value:852});window.visualViewport!.dispatchEvent(new Event('resize'));});
  await expect(page.locator('[data-layout-role="footer"]')).toBeVisible();
});


test('API-key checkboxes control selection actions', async ({page}) => {
  await page.goto('/design/5775-15322');
  await page.getByRole('checkbox',{name:/^Select Pit Display/}).check();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:15503');
  await expect(page.getByRole('button',{name:'Rename key',exact:true})).toBeVisible();
  await page.getByRole('checkbox',{name:/^Select Picklists/}).check();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:15604');
  await expect(page.getByRole('button',{name:'Delete 2 keys',exact:true})).toBeVisible();
});

test('Back returns to the actual prior screen and retains input', async ({page}) => {
  await page.goto('/forms');
  await page.locator('[data-figma-node="I5775:10088;54:171"]').click();
  await page.getByRole('textbox',{name:'Name',exact:true}).fill('Remember this form');
  await page.getByRole('button',{name:'Create form',exact:true}).click();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:14699');
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:10120');
  await expect(page.getByRole('textbox',{name:'Name',exact:true})).toHaveValue('Remember this form');
});

test('rating buttons update minimum and maximum values', async ({page}) => {
  await page.goto('/design/5775-14235');
  await page.getByRole('button',{name:'Increase minimum value',exact:true}).click();
  await expect(page.locator('[data-stepper="step:5775:14246"]')).toHaveText('2');
  await page.getByRole('button',{name:'Decrease minimum value',exact:true}).click();
  await expect(page.locator('[data-stepper="step:5775:14246"]')).toHaveText('1');
  await page.getByRole('button',{name:'Decrease maximum value',exact:true}).click();
  await expect(page.locator('[data-stepper="step:5775:14252"]')).toHaveText('9');
});

test('profile text is centered and entered search text is white', async ({page}) => {
  await page.goto('/design/5775-15116');
  const title=await page.getByText('Collin C',{exact:true}).boundingBox();
  expect(title!.x+title!.width/2).toBeCloseTo(196.5,0);
  const avatar=await page.locator('[data-design-name="Avatar"]').boundingBox();
  const header=await page.locator('[data-layout-role="header"]').boundingBox();
  expect(avatar!.y).toBeGreaterThan(header!.y+header!.height);
  expect(title!.y).toBeGreaterThan(avatar!.y+avatar!.height);
  await page.goto('/forms');
  const search=page.getByRole('textbox',{name:'Search forms'});
  await search.fill('Scouting');
  await expect(search).toHaveCSS('color','rgb(255, 255, 255)');
});

test('assignment headings collapse and schedule pills filter rows', async ({page}) => {
  await page.goto('/design/5775-10200');
  const coverage=page.getByRole('button',{name:'Coverage',exact:true});
  const card=page.getByRole('button',{name:'4/20 teams scouted 16/20 teams assigned',exact:true});
  await coverage.click();await expect(card).toBeHidden();await expect(coverage).toHaveAttribute('aria-expanded','false');
  await coverage.click();await expect(card).toBeVisible();
  await page.getByRole('button',{name:'Unassigned',exact:true}).click();
  await expect(page.getByText('Highlander Robotics',{exact:true})).toBeVisible();
  await expect(page.getByText('Eaglestrike',{exact:true})).toBeHidden();
  await page.getByRole('button',{name:'All',exact:true}).click();
  await expect(page.getByText('Eaglestrike',{exact:true})).toBeVisible();
});

test('match filter tags remove and restore the qualification list', async ({page}) => {
  await page.goto('/design/5775-16503');
  await page.getByRole('button',{name:'Remove Quals filter',exact:true}).click();
  await expect(page.locator('[data-design-name="Qualification 57"]')).toBeHidden();
  await page.getByRole('button',{name:'Choose match filters',exact:true}).click();
  await page.getByRole('checkbox',{name:'Quals',exact:true}).check();
  await expect(page.locator('[data-design-name="Qualification 57"]')).toBeVisible();
});

test('options reveal Delete on a horizontal swipe and delete in place', async ({page}) => {
  await page.goto('/design/5775-14305');
  const row=page.getByRole('group',{name:'No option',exact:true});
  const action=page.getByRole('button',{name:'Delete No option',exact:true});
  await expect(action).toHaveAttribute('tabindex','-1');
  const box=await row.boundingBox();
  await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);
  await page.mouse.down();await page.mouse.move(box!.x+box!.width/2-110,box!.y+box!.height/2,{steps:8});await page.mouse.up();
  await expect(action).toHaveAttribute('tabindex','0');
  await action.click();await expect(row).toBeHidden();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:14305');
});

test('dialogs have a blurred backdrop and clear foreground', async ({page}) => {
  await page.goto('/design/5775-15386');
  await expect(page.locator('[data-design-name="DialogBackdrop"]')).toHaveCSS('backdrop-filter','blur(5px)');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCSS('filter','none');
});

test('Members exposes promotion and assignment labels share a right edge', async ({page}) => {
  await page.goto('/settings');
  await expect(page.getByRole('button',{name:'Promote Analysts',exact:true})).toHaveCount(0);
  await page.goto('/design/5775-15010');
  await page.getByRole('button',{name:'Promote Analysts',exact:true}).click();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:14879');
  await page.goto('/design/5775-10200');
  const labels=page.locator('[data-figma-node="5775:10236"], [data-figma-node="5775:10249"], [data-figma-node="5775:10262"]');
  const edges=await labels.evaluateAll(elements=>elements.map(e=>e.getBoundingClientRect().right));
  expect(Math.max(...edges)-Math.min(...edges)).toBeLessThan(1);
});


test('Back skips all form tab changes and reverses the page swipe', async ({page}) => {
  await page.goto('/forms');
  await page.getByRole('button',{name:'DCMP Pit Scouting Created by Collin C · 45 responses'}).click();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:10144');
  await page.getByRole('button',{name:'Assignments',exact:true}).click();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:10200');
  await page.getByRole('button',{name:'Responses',exact:true}).click();
  await expect(page.getByText('45 responses',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Questions',exact:true}).click();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:10069');
  await expect(page.locator('.design-frame')).toHaveAttribute('data-navigation-direction','back');
});

test('closing search restores all rows and selected values', async ({page}) => {
  await page.goto('/design/5775-15945');
  await expect(page.getByRole('checkbox').first()).toBeVisible();
  const total=await page.getByRole('checkbox').count();
  await page.getByRole('checkbox',{name:'Team 5940',exact:true}).check();
  await page.getByRole('button',{name:'search',exact:true}).click();
  const search=page.getByRole('textbox',{name:'Search teams'});
  await search.fill('5940');
  await expect(page.getByRole('checkbox',{name:'Team 5940',exact:true})).toBeChecked();
  const field=await search.boundingBox();expect(field!.x+field!.width).toBeLessThan(393);
  await page.getByRole('button',{name:'x',exact:true}).click();
  await expect(page.getByRole('checkbox')).toHaveCount(total);
  await expect(page.getByRole('checkbox',{name:'Team 5940',exact:true})).toBeChecked();
});

test('profile bar has equal controls and preserves the gradient behind them', async ({page}) => {
  await page.goto('/design/5775-15116');
  const bar=page.locator('.design-profile-bar');
  await expect(bar).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  const back=await page.getByRole('button',{name:'Back',exact:true}).boundingBox();
  const edit=await page.getByRole('button',{name:'Edit profile',exact:true}).boundingBox();
  expect(back!.height).toBe(44);expect(edit!.height).toBe(44);expect(back!.y).toBe(edit!.y);
});


test('Save stays painted while switching question tabs', async ({page}) => {
  await page.goto('/design/5775-14183');
  await page.getByRole('radio',{name:'Photo',exact:true}).click();
  await page.evaluate(()=>{
    const state={running:true,missing:0};(window as unknown as {footerProbe:typeof state}).footerProbe=state;
    function sample(){const button=[...document.querySelectorAll('.design-dock button')].find(e=>e.textContent?.trim()==='Save changes');if(!button || getComputedStyle(button).opacity!=='1')state.missing++;if(state.running)requestAnimationFrame(sample);}
    requestAnimationFrame(sample);
  });
  await page.getByRole('button',{name:'Options',exact:true}).click();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:14284');
  await page.waitForTimeout(180);
  const missing=await page.evaluate(()=>{const state=(window as unknown as {footerProbe:{running:boolean;missing:number}}).footerProbe;state.running=false;return state.missing;});
  expect(missing).toBe(0);
});
