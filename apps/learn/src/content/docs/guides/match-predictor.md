---
title: Match Predictor Page
description: This guide explains the calculations involved with Lovat Dahsboard's match predictor page.
---

The Match Predictor page can be accessed by clicking on the brain icon on a match from the Match Schedules page. It displays estimated scores, roles and other information about the match, as well as an estimated percent chance of each alliance winning the match. 

### Match Predictor Calculations

To find win percentage, the app first generates an alliance’s score distribution from each of the three teams’ point averages and standard deviations using the equations:


$\sigma_{\text{Alliance}} = \sqrt{\sigma_{\text{Team 1}}^2 + \sigma_{\text{Team 2}}^2 + \sigma_{\text{Team 3}}^2}$

$\mu_{\text{Alliance}} = \mu_{\text{Team 1}} + \mu_{\text{Team 2}} + \mu_{\text{Team 3}}$

After plugging these values into the formula for a normal distribution’s probability density function (PDF),  the conversion of team point distributions to one alliance point distribution might look like this:

![Graph](/src/assets/graph-1.png)

Teams’ point distributions are dashed and the alliance distribution is purple. The graph’s x-axis represents the number of points scored in a game and the y-axis represents the relative frequencies (probability density) with which each point outcome occurs. 

After each alliance’s point distributions are found, one distribution can be subtracted from the other to get the mean and standard deviation for a distribution of the two alliance’s point differential:

$\sigma_{\text{Alliance 1} - \text{Alliance 2}} = \sqrt{\sigma_{\text{Alliance 1}}^2 + \sigma_{\text{Alliance 2}}^2}$

$\mu_{\text{Alliance 1} - \text{Alliance 2}} = \mu_{\text{Alliance 1}} - \mu_{\text{Alliance 2}}$

![Graph](/src/assets/graph-2.png)

This is how that might look on a graph, where the purple graph is the distribution of Red Alliance Points minus Blue Alliance Points.

Any point to the right of the y-axis on this point differential distribution represents a red win (because red points - blue points is positive), and any point to the left is a blue win (because red points - blue points is negative in that case.) To find the probability that blue will win (or that red loses) one can find the area under the graph to the left of the y-axis, or the integral from negative infinity to zero. 

This looks like: 

![Graph](/src/assets/graph-3.png)

Compute this, and you’d get a 3.3% chance of blue winning: 

$\int_{-\infty}^0 h(x) \, dx = 0.0330052790789$

The program finds this area by determining zero’s z-score on the distribution and converting this to a p-value, which yields the same left-tailed proportion. 


