WITH measured AS (
 SELECT frame, seconds, CAST(FLOOR(grid_x * 24.0 / 64) AS INTEGER) AS gx,
 CAST(FLOOR(grid_y * 24.0 / 64) AS INTEGER) AS gy, r, g, b, luma, texture, change
 FROM data WHERE kind = 'tile'
), cells AS (
 SELECT frame, MAX(seconds) AS seconds, gx, gy, COUNT(*) AS samples,
 ROUND(AVG(r),6) AS r, ROUND(AVG(g),6) AS g, ROUND(AVG(b),6) AS b,
 ROUND(AVG(luma),6) AS luma, ROUND(AVG(texture),6) AS texture, ROUND(AVG(change),6) AS change
 FROM measured GROUP BY frame,gx,gy
)
SELECT '' AS id,'tile' AS kind,(gx+.5)/24 AS x,1-(gy+.5)/24 AS y,
 0 AS radius,'scan-tile' AS origin,frame,seconds,gx AS grid_x,gy AS grid_y,r,g,b,luma,texture,change,samples
FROM cells
UNION ALL
SELECT id,kind,x,y,radius,origin,-1 AS frame,0 AS seconds,-1 AS grid_x,-1 AS grid_y,
 0 AS r,0 AS g,0 AS b,0 AS luma,0 AS texture,0 AS change,1 AS samples
FROM data WHERE kind IN ('nutrient','inoculum')
ORDER BY kind,frame,grid_y,grid_x,id
