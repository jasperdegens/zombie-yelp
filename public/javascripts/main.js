$('#sendLoc').on('click', function(){
  getYelpResults();
});

$('#loc').keypress(function (e) {
  if (e.which == 13) {
    getYelpResults();
  }
});

function getYelpResults(){
  var loc = $('#loc').val();
  console.log(loc);
  var resultsDiv = $('#results');
  resultsDiv.html('');
  $.getJSON('/api/location/' + loc, function(json, textStatus) {
    console.log(json);
      for(var j = 0; j < json.length; j+=4){
        var row = '<div class="row">';
        for (var i = j; i < Math.min(j+4, json.length); i++) {
          var link = '<a href="' + json[i].url + '">' + json[i].name + '</a>';
          var rating = '<img src="' + json[i].rating_img_url + '"/>';
          var numRatings = '<p>' + json[i].review_count + ' reviews</p>';
          var col = '<div class="restaurant col-md-3">' + link + rating + numRatings + '</div>';
          row += col;
        }
        row += '</div>';
        resultsDiv.append(row);
      }
  });
}