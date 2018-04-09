echo "Compress the external files"

uglifyjs controller.src.js --compress --mangle --output controller.js

uglifycss --output layout.css layout.src.css

echo "Inline the external files into the HTML file"

cp index.src.html index.build.html

awk 'NR==FNR { a[n++]=$0; next } 
/\<script src\="controller\.src\.js"\>\<\/script\>/ { for (i=0;i<n;++i) { if (i==0) { print "<script>"; } print a[i]; if (i==n-1) { print "</script>"; } } next }
1' controller.js index.build.html > tmp && mv tmp index.build.html

awk 'NR==FNR { a[n++]=$0; next } 
/\<link rel\="stylesheet" href\="layout\.src\.css" \/\>/ { for (i=0;i<n;++i) { if (i==0) { print "<style>"; } print a[i]; if (i==n-1) { print "</style>"; } } next }
1' layout.css index.build.html > tmp && mv tmp index.build.html

echo "Compress the HTML file"
html-minifier --collapse-whitespace --collapse-inline-tag-whitespace --keep-closing-slash --quote-character "\"" --output index.html index.build.html

rm index.build.html

echo "Build completed"