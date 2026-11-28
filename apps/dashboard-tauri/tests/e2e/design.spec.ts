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
  expect(manifest).toHaveLength(104);
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
      return !img.naturalWidth || (!img.closest('[data-layout-role="system"]') && (!rect.width || !rect.height)) || !(img.src.includes('/design-assets/') || img.closest('.mg2-slider') && img.src.startsWith('data:image/svg+xml,'));
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
  await page.addStyleTag({content:'.design-viewport{padding-bottom:34px !important}'});
  await page.evaluate(()=>window.dispatchEvent(new Event('resize')));
  const height=await page.locator('.design-frame').evaluate(e=>e.getBoundingClientRect().height);
  await page.getByRole('textbox',{name:'Name',exact:true}).focus();
  await page.evaluate(()=>{
    Object.defineProperty(window.visualViewport,'height',{configurable:true,value:500});
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(page.locator('.design-viewport')).toHaveClass(/keyboard-open/);
  expect(await page.locator('.design-frame').evaluate(e=>e.getBoundingClientRect().height)).toBe(height);
  await expect(page.locator('[data-layout-role="footer"]')).toBeHidden();
  const body=await page.locator('[data-layout-role="body"]').boundingBox();
  expect(Math.abs(body!.y+body!.height-500)).toBeLessThan(1);
  await page.getByRole('textbox',{name:'Name',exact:true}).blur();
  await page.evaluate(()=>{Object.defineProperty(window.visualViewport,'height',{configurable:true,value:852});window.visualViewport!.dispatchEvent(new Event('resize'));});
  await expect(page.locator('[data-layout-role="footer"]')).toBeVisible();
});


test('API-key checkboxes control selection actions', async ({page}) => {
  await page.goto('/design/5775-15322');
  await page.getByRole('checkbox',{name:/^Select Pit Display/}).check();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:15322');
  await expect(page.getByRole('button',{name:'Rename key',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Delete key',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Delete 0 keys',exact:true})).toHaveCount(0);
  await page.getByRole('checkbox',{name:/^Select Picklists/}).check();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:15322');
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
  await expect(page.getByRole('textbox',{name:'Search responses',exact:true})).toBeVisible();
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
  await page.getByRole('button',{name:'Close search',exact:true}).click();
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


test('Official Rank search opens in place and filters complete rows', async ({page}) => {
  await page.goto('/design/5775-17119');
  await page.getByRole('button',{name:'search',exact:true}).click();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:17119');
  await page.getByRole('textbox',{name:'Search teams'}).fill('8033');
  await expect(page.getByText('8033 - Highlander Robotics',{exact:true})).toBeVisible();
  await expect(page.getByText('114 ⁃ Eaglestrike',{exact:true})).toBeHidden();
});

test('rename dialog stays within the profile viewport', async ({page}) => {
  await page.goto('/design/5775-15180');
  await page.getByRole('button',{name:'Edit profile',exact:true}).click();
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  const bounds=await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(15);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(378);
  expect(bounds!.height).toBeLessThan(350);expect(bounds!.y).toBeGreaterThan(0);expect(bounds!.y+bounds!.height).toBeLessThan(852);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:15180');
});

test('successful key creation does not leave dialog entries in Back history', async ({page}) => {
  await page.goto('/settings');
  await page.getByRole('button',{name:/^Lovat API/}).click();
  await page.getByRole('button',{name:'Create a new key',exact:true}).click();
  await page.getByRole('textbox',{name:'Name',exact:true}).fill('Test key');
  await page.getByRole('button',{name:'Create',exact:true}).click();
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:14720');
});

test('data source summary reports a count for multiple selected teams', async ({page}) => {
  await page.goto('/design/5775-15945');
  await page.getByRole('checkbox',{name:'Team 5940',exact:true}).check();
  await page.getByRole('button',{name:'Apply changes',exact:true}).click();
  await expect(page.getByText('2 teams',{exact:true})).toBeVisible();
});

test('multiple-select options retain the title, limits, and every choice', async ({page}) => {
  await page.goto('/design/5775-14394');
  await expect(page.getByRole('textbox',{name:'Question title',exact:true})).toHaveValue('What parts of their robot have broken?');
  for(const label of ['Shooter','Drivetrain','Intake','Hopper','Other'])await expect(page.getByRole('group',{name:`${label} option`,exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Increase minimum selections',exact:true}).click();
  await expect(page.locator('[data-stepper="step:5775:14407"]')).toHaveText('1');
  await page.getByRole('group',{name:'Shooter option',exact:true}).getByRole('button',{name:'pencil',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Yes',exact:true})).toHaveValue('Shooter');
  await page.getByRole('textbox',{name:'Yes',exact:true}).fill('Arm');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:14394');
  await expect(page.getByText('Arm',{exact:true})).toBeVisible();
});

test('team assignments support pointer dragging between scouters', async ({page}) => {
  await page.goto('/design/5775-10287');
  const jack=page.getByRole('region',{name:'Jack S assignments',exact:true});
  const collin=page.getByRole('region',{name:'Collin C assignments',exact:true});
  await expect(jack).toBeVisible();
  const count=await jack.locator('.assignment-team').count();
  const handle=jack.getByRole('button',{name:/^Drag 114 /}).first();
  const start=await handle.boundingBox(),target=await collin.boundingBox();
  await page.mouse.move(start!.x+start!.width/2,start!.y+start!.height/2);await page.mouse.down();
  await page.mouse.move(target!.x+target!.width/2,target!.y+30,{steps:10});await page.mouse.up();
  await expect(jack.locator('.assignment-team')).toHaveCount(count-1);
  await expect(collin.locator('.assignment-team')).toHaveCount(6);
});

test('autoassign picker opens only with the arrow and assignments apply', async ({page}) => {
  await page.goto('/design/5775-10287');
  await page.getByRole('button',{name:'wand',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('group',{name:'Available scouters',exact:true})).toBeHidden();
  await page.getByRole('textbox',{name:'Find scouters',exact:true}).focus();
  await expect(page.getByRole('group',{name:'Available scouters',exact:true})).toBeHidden();
  await page.getByRole('button',{name:'Choose scouters',exact:true}).click();
  await expect(page.getByRole('group',{name:'Available scouters',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Assign',exact:true}).click();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:10287');
  await expect(page.getByRole('region',{name:'Unassigned assignments',exact:true}).locator('.assignment-team')).toHaveCount(0);
});


test('Home banner fills its container and source footers have clearance', async ({page}) => {
  await page.goto('/');
  const image=page.locator('[data-figma-node="5775:9819"]');await expect(image).toBeVisible();
  await image.locator('img').evaluate(e=>(e as HTMLImageElement).decode());
  const fill=await image.evaluate(e=>({image:e.getBoundingClientRect().width,parent:e.parentElement!.getBoundingClientRect().width}));
  expect(fill.image).toBeCloseTo(fill.parent,0);
  const crop=await image.locator('img').evaluate(e=>{const r=e.getBoundingClientRect(),p=e.parentElement!.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,clipLeft:p.left,clipRight:p.right,clipTop:p.top,clipBottom:p.bottom};});
  expect(crop.left).toBeLessThanOrEqual(crop.clipLeft);expect(crop.right).toBeGreaterThanOrEqual(crop.clipRight);expect(crop.top).toBeLessThanOrEqual(crop.clipTop);expect(crop.bottom).toBeGreaterThanOrEqual(crop.clipBottom);
  await page.goto('/design/5775-15945');
  const body=page.locator('[data-layout-role="body"]');await expect(body).toBeVisible();
  const content=await body.boundingBox(),footer=await page.locator('[data-layout-role="footer"]').boundingBox();
  expect(footer!.y-content!.y-content!.height).toBeGreaterThanOrEqual(15);
});


test('opening a dialog from search prevents background focus', async ({page}) => {
  await page.goto('/design/5775-15322');
  await page.getByRole('button',{name:'search',exact:true}).click();
  await page.getByRole('textbox',{name:'Search API keys',exact:true}).fill('Pit');
  await page.getByRole('button',{name:'Create a new key',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.design-dock')).toHaveAttribute('inert','');
  expect(await page.evaluate(()=>!!document.activeElement?.closest('[inert]'))).toBe(false);
  await page.getByRole('textbox',{name:'Name',exact:true}).fill('Focused modal');
  await expect(page.getByRole('textbox',{name:'Name',exact:true})).toBeFocused();
});


test('new API keys retain identity through selection, deletion, and renaming', async ({page}) => {
  await page.goto('/design/5775-15322');
  await page.getByRole('button',{name:'Create a new key',exact:true}).click();
  await page.getByRole('textbox',{name:'Name',exact:true}).fill('Fourth test key');
  await page.getByRole('button',{name:'Create',exact:true}).click();
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:15653');
  const rows=page.locator('.design-page [data-design-name="TableRow"]');await expect(rows).toHaveCount(4);
  await expect(rows.last().getByText('Fourth test key',{exact:true})).toBeVisible();
  await rows.last().getByRole('checkbox').check();
  await expect(rows).toHaveCount(4);
  await expect(page.getByRole('button',{name:'Delete key',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Delete 0 keys',exact:true})).toHaveCount(0);
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:15653');
  await page.getByRole('button',{name:'Delete key',exact:true}).click();
  await page.getByRole('button',{name:'Delete',exact:true}).click();
  await expect(page.locator('.design-page [data-design-name="TableRow"]')).toHaveCount(3);
  await expect(page.getByText('Fourth test key',{exact:true})).toBeHidden();
  await page.getByRole('checkbox',{name:'Select Pit Display',exact:true}).check();
  await page.getByRole('button',{name:'Rename key',exact:true}).click();
  await page.getByRole('textbox',{name:'Pit Display',exact:true}).fill('Pit tools');
  await page.getByRole('button',{name:'Rename',exact:true}).click();
  await expect(page.getByText('Pit tools',{exact:true})).toBeVisible();
  await expect(page.getByRole('checkbox',{name:'Select Pit tools',exact:true})).toBeChecked();
  await expect(page.getByRole('button',{name:'Delete key',exact:true})).toBeVisible();
});

test('type icons use the selected accent and multiple select has an empty Hint', async ({page})=>{
 await page.goto('/design/5775-14183');
 const photo=page.getByRole('radio',{name:'Photo',exact:true});await photo.click();
 await expect(photo.locator('.design-type-icon')).toHaveCSS('background-color','rgb(181, 154, 255)');
 await page.getByRole('button',{name:'Options',exact:true}).click();
 await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:14284');
 await page.goto('/design/5775-14394');
 await page.locator('[data-design-name="lucide/pencil"]').first().click();
 await expect(page.getByRole('textbox',{name:'Hint',exact:true})).toHaveValue('');
 await expect(page.getByRole('textbox',{name:'Hint',exact:true})).toHaveAttribute('placeholder','Hint');
});

test('promotion applies to the selected analysts and stays applied when reopened', async ({page})=>{
 await page.goto('/design/5775-15010');
 await page.getByRole('button',{name:'Promote Analysts',exact:true}).click();
 const leo=page.getByRole('checkbox',{name:'Leo K',exact:true});await leo.check();
 await page.getByRole('button',{name:/^Promote \d+ Analysts?$/}).click();
 await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:15010');
 await expect(page.getByRole('status')).toContainText('Promoted');
 await page.getByRole('button',{name:'Promote Analysts',exact:true}).click();
 await expect(page.getByRole('checkbox',{name:'Leo K',exact:true})).toHaveCount(0);
});

test('add scouter creates a drop zone and dragging displays its landing space', async ({page})=>{
 await page.goto('/design/5775-10287');
 await page.getByRole('button',{name:'＋ Add scouter',exact:true}).click();
 await page.getByRole('group',{name:'Add scouter',exact:true}).getByRole('button',{name:'Leo K',exact:true}).click();
 const zone=page.locator('[data-assignee="Leo K"]');await zone.scrollIntoViewIfNeeded();
 await expect(zone).toBeVisible();
 const data=await page.evaluateHandle(()=>new DataTransfer());
 await zone.dispatchEvent('dragover',{dataTransfer:data});
 await expect(zone.locator('.assignment-landing')).toBeVisible();
 await expect(zone).toHaveClass(/drop-target/);
});

test('new response, form settings, and question previews are reachable', async ({page})=>{
 await page.goto('/design/5775-10144');
 await page.getByRole('button',{name:'Responses',exact:true}).click();
 await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5787:14528');
 await page.getByRole('button',{name:/8033 - Highlander Robotics.*Uploaded/}).click();
 await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5787:14646');
 await page.getByRole('button',{name:'Back',exact:true}).click();
 await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5787:14528');
 await page.getByRole('button',{name:'settings',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Name',exact:true})).toHaveValue('DCMP Break Scouting');
 await page.getByRole('button',{name:'Delete form',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('Delete DCMP Break Scouting?');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.goto('/design/5775-14235');
 await page.getByRole('button',{name:'eye',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.getByRole('slider')).toHaveValue('5');
 await page.getByRole('slider').fill('8');
 await expect(page.getByRole('slider')).toHaveValue('8');
});

test('select all toggles to deselect all and clears the same selection',async({page})=>{
 await page.goto('/design/5775-15945');
 await page.getByRole('button',{name:'Select all',exact:true}).click();
 await expect(page.getByRole('button',{name:'Deselect all',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Deselect all',exact:true}).click();
 expect(await page.getByRole('checkbox').evaluateAll(inputs=>inputs.every(input=>!(input as HTMLInputElement).checked))).toBe(true);
 await expect(page.getByRole('button',{name:'Select all',exact:true})).toBeVisible();
});

test('form settings aligns with the viewport and target cannot change',async({page})=>{
 await page.goto('/design/5787-14585');
 const name=await page.getByRole('textbox',{name:'Name',exact:true}).boundingBox();
 const action=await page.getByRole('button',{name:'Export form data',exact:true}).boundingBox();
 expect(name!.x).toBeGreaterThanOrEqual(26);expect(action!.x).toBe(26);
 const target=page.locator('[aria-disabled="true"]');await expect(target).toHaveCount(3);
 await expect(page.getByRole('radio',{name:'Team',exact:true})).toHaveCount(0);
});

test('option hints persist for single and multiple select and appear in previews',async({page})=>{
 for(const [screen,preview] of [['5775-14305','5787:17116'],['5775-14394','5787:17179']]){
  await page.goto('/design/'+screen);
  await page.getByRole('textbox',{name:'Question hint',exact:true}).fill('Choose the best answer');
  await page.locator('[data-design-name="lucide/pencil"]').first().click();
  const hint=page.getByRole('textbox',{name:'Hint',exact:true});
  if(screen==='5775-14305')await expect(hint).toHaveValue('Parts fell off, disconnects, etc');
  await hint.fill('Use observations from this tournament');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByText('Use observations from this tournament',{exact:true})).toBeVisible();
  const required=page.getByRole('switch',{name:'Required',exact:true});await required.uncheck();
  await page.getByRole('button',{name:'eye',exact:true}).click();
  await expect(page.locator('.design-frame')).toHaveAttribute('data-frame',preview);
  await expect(page.getByRole('dialog').getByText('Optional',{exact:true})).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Choose the best answer',{exact:true})).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Use observations from this tournament',{exact:true})).toBeVisible();
 }
});

test('every optional question type has an Optional preview subtitle',async({page})=>{
 for(const screen of ['5775-14235','5775-14265','5775-14284']){
  await page.goto('/design/'+screen);await page.getByRole('switch',{name:'Required',exact:true}).uncheck();
  await page.getByRole('button',{name:'eye',exact:true}).click();
  await expect(page.getByRole('dialog').getByText('Optional',{exact:true})).toBeVisible();
 }
});

test('navbar direction follows tab order and revisits do not create history loops',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Forms',exact:true}).click();
 await expect(page.locator('.design-frame')).toHaveAttribute('data-navigation-direction','forward');
 await page.getByRole('button',{name:'Scouting',exact:true}).click();
 await expect(page.locator('.design-frame')).toHaveAttribute('data-navigation-direction','back');
 await page.getByRole('button',{name:'Forms',exact:true}).click();
 await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:10069');
 await expect(page.locator('.design-frame')).toHaveAttribute('data-navigation-direction','forward');
 await page.evaluate(()=>history.back());
 await expect(page.locator('.design-frame')).toHaveAttribute('data-frame','5775:9807');
});

test('Home fits above the lowered navbar without a scrolling region',async({page})=>{
 await page.goto('/');
 await page.addStyleTag({content:'.design-viewport{padding-top:64px!important;padding-bottom:34px!important}'});
 await page.evaluate(()=>window.dispatchEvent(new Event('resize')));
 const body=page.locator('[data-layout-role="body"]');
 expect(await body.evaluate(element=>element.scrollHeight-element.clientHeight)).toBeLessThanOrEqual(1);
 await expect(body).toHaveCSS('overflow-y','hidden');
 const nav=await page.locator('[data-layout-role="nav"]').boundingBox();
 expect(nav!.height).toBe(52);expect(nav!.y+nav!.height).toBe(818);
});

test('dragging retains the source card content, size, and colours',async({page})=>{
 await page.goto('/design/5775-10287');
 const card=page.locator('.assignment-team').first();
 const before=await card.evaluate(element=>({width:element.getBoundingClientRect().width,height:element.getBoundingClientRect().height,bg:getComputedStyle(element).backgroundColor,text:element.textContent}));
 const handle=card.getByRole('button',{name:/^Drag /});const box=await handle.boundingBox();
 await page.mouse.move(box!.x+10,box!.y+15);await page.mouse.down();await page.mouse.move(box!.x+30,box!.y+20);
 const ghost=page.locator('.assignment-ghost');await expect(ghost).toBeVisible();
 await expect(ghost).toHaveCSS('background-color',before.bg);
 const after=await ghost.boundingBox();expect(after!.width).toBe(before.width);expect(after!.height).toBe(before.height);
 await expect(ghost.locator('img')).toHaveAttribute('src',await card.locator('img').getAttribute('src') as string);
 await page.mouse.up();
});

test('promotion actions use centered primary text even after selecting several users',async({page})=>{
 await page.goto('/design/5775-15010');
 const entry=page.getByRole('button',{name:'Promote Analysts',exact:true});
 await expect(entry.locator('.mg2-button-content')).toHaveCSS('justify-content','center');
 await entry.click();await page.getByRole('checkbox',{name:'Leo K',exact:true}).check();
 const action=page.getByRole('button',{name:/^Promote \d+ Analysts?$/});
 await expect(action).toHaveCSS('color','rgb(23, 23, 23)');
 await expect(action.locator('.mg2-button-content')).toHaveCSS('justify-content','center');
});
