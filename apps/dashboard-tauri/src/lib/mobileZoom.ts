/** Keep app gestures at 1x while preserving single-finger scrolling. */
export function lockMobileZoom(document:Document):()=>void {
  const gesture=(event:Event)=>event.preventDefault();
  const touch=(event:TouchEvent)=>{if(event.touches.length>1)event.preventDefault();};
  const options={passive:false,capture:true};
  for(const name of ['gesturestart','gesturechange','gestureend'])document.addEventListener(name,gesture,options);
  document.addEventListener('touchstart',touch,options);
  document.addEventListener('touchmove',touch,options);
  return ()=>{
    for(const name of ['gesturestart','gesturechange','gestureend'])document.removeEventListener(name,gesture,true);
    document.removeEventListener('touchstart',touch,true);
    document.removeEventListener('touchmove',touch,true);
  };
}
