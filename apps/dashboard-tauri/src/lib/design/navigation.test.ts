import {describe,it,expect} from 'vitest';
import {navbarDirection,revisitDelta} from './navigation.ts';
describe('dashboard navigation',()=>{
 it('uses the relative tab order in either direction',()=>{
  expect(navbarDirection('5775:10069','5775:9807')).toBe('back');
  expect(navbarDirection('5775:10069','5775:17119')).toBe('back');
  expect(navbarDirection('5775:17119','5775:10069')).toBe('forward');
  expect(navbarDirection('5775:17404','5775:10069')).toBe('forward');
 });
 it('reuses an existing entry and leaves new pages to be pushed',()=>{
  expect(revisitDelta(['5775:9807','5775:10069'],'5775:9807')).toBe(-2);
  expect(revisitDelta(['5775:9807'],'5775:10069')).toBe(0);
  expect(revisitDelta(['5775:9936'],'5775:9807')).toBe(-1);
 });
});
