import {test,expect} from '@playwright/test';
test('named routes drive page navigation, tab replacement and Back',async({page})=>{
 await page.goto('/dashboard/forms');
 await page.getByRole('button',{name:'Home',exact:true}).click();
 await expect(page).toHaveURL(/\/dashboard\/home$/);
 await page.getByRole('button',{name:'Forms',exact:true}).click();
 await expect(page).toHaveURL(/\/dashboard\/forms$/);
});
test('named API key routes preserve selection across dialog actions',async({page})=>{
 await page.goto('/dashboard/api-keys');
 await page.getByRole('button',{name:'Create a new key',exact:true}).click();
 await expect(page).toHaveURL(/\/dashboard\/api-keys\/create$/);
 await page.getByRole('textbox',{name:'Name',exact:true}).fill('Named route key');
 await page.getByRole('button',{name:'Create',exact:true}).click();
 await expect(page).toHaveURL(/\/dashboard\/api-keys\/created$/);
 await page.getByRole('button',{name:'Done',exact:true}).click();
 await expect(page.getByText('Named route key',{exact:true})).toBeVisible();
});
test('legacy review links navigate onward using canonical routes',async({page})=>{
 await page.goto('/design/5775-10144');
 await page.getByRole('button',{name:'Add new question',exact:true}).click();
 await expect(page).toHaveURL(/\/dashboard\/questions\/type$/);
 await expect(page.getByRole('heading',{name:'New question',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Back',exact:true}).click();
 await expect(page.getByRole('button',{name:'Add new question',exact:true})).toBeVisible();
});
