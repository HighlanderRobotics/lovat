---
title: Using  Picklists
description: All about the calculations involved with Lovat Dahsboard's picklists feature and how to use this feature.
---

### Creating and Viewing Picklists

You can view picklists shared by your team in the shared tab. You cannot change these. Any picklists that aren't yours but you can change will be found in the mutable tab. To edit these, click the pencil in the top right. 

To create a new picklist, open the navigation drawer and select picklists. Then, click the plus in the bottom right. You can use the sliders to adjust how import each metric will be when creating your picklist. You can also share your picklist with your team. 

You can edit your created picklists by tapping the picklist and using the buttons in the top right. 

### Picklist Calculations

**Picklist Metrics**

These are the metrics used in picklists. Each one can be assigned a weight before creating picklists. 
- totalPoints
- defense
- algaePickups
- coralPickups
- barge
- autoPoints
- driverAbility
- coralLevel1Scores
- coralLevel2Scores
- coralLevel3Scores
- coralLevel4Scores
- algaeProcessor
- algaeNet
- teleopPoints
- feeds

**Picklist Procedure**

We [standardize](https://en.wikipedia.org/wiki/Standard_score#:~:text=This%20process%20of%20converting%20a,they%20are%20in%20this%20article.) team’s performances in certain picklist stats by comparing them to other teams in the competition. Using the mean and standard deviation for each stat across all robots, the app could find a team’s position on the field’s normal distribution (bell curve) for each stat. This comparison is what was used to convert robots’ raw performances in different stats (Avg. total score, avg climb points, etc.) into comparable indexes called z-scores (# of standard deviations from the field’s mean). For each robot’s stats, the conversion was performed with the formula $ Z = \frac{x - \mu}{\sigma}$, where $ x $ is the team’s performance in the stat, $ \mu $ is the mean of that stat across all robots, and $ \sigma $ is the population standard deviation of the stat across all robots. To contextualize these conversions, if one robot has a z-score of 1.3 in average climb points but a z-score of 2 in defensive actions, it means they’re better at defending than climbing when compared to other robots. The products of these z-scores and their corresponding slider constants could then be added to make a weighted picklist.

For example:

|| # Coral L4 (weight 0.4) | # Coral L3 (weight 0.3) | Avg. Barge points (weight 0.5) |
| -------- |----------| ----------- | ----- |
| Team's avg      | 12 | 5       | 4 |
| Field avg   | 5 |4        | 7 |
| Field standard dev| 3 |2        | 1 |
| Plug into formula, multiply by weight| $ {\frac{12-5}{3}} * 0.3 = 2.33$ | $ {\frac{5-4}{2}} * 0.4 = 0.15$ | $ {\frac{4-7}{1} * 0.5} = -1.5 $ |

Then add these terms to get an index of 0.98:   2.33 + .15 +(-1.5)  = 0.98. 
One can then compare these indexes to generate a picklist. 
