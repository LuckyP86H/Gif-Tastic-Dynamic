// top is defined by an array of string
var topics = ["College Graduate", "Oscar", "Celebrity", "Grammys",
"Singer", "Actor", "Dancer", "Rapper","Teacher", "Student", 
"Big Bang Theory", "Modern Family", "Mom", "Dad", "Sister", "Baby", "Brother"];

// add button to arary
$("#addTopic").on("click", function(event) {
	event.preventDefault();

	// put the topic name into the test field
	var topicName = $("#topic-input").val().trim();
	
	// if array does not have the value, add this value. 
	if ((topics.indexOf(topicName) === -1) && (topicName !== '')) {
		topics.push(topicName);
	}

	// clear up after each clicking
	$("#topic-input").val("");
	setButtons();
});

// click event listener to calls function to display gifs
$(document).on("click", ".topic", displayGIFs);

// click tag topic to stop/start gif
$(document).on("click", ".gif-image", displayGIF);

// Function to set the buttons
function setButtons() {

	// Clears out existing buttons to prevent duplicates
	$("#topicButtons").empty();

	for (var i = 0; i < topics.length; i++) {
		// creates a new button for each element in the array
		var newButton = $("<button>");

		// adds a class of topic to the button
		newButton.addClass("topic");

		// sets the data-topic attribute to the name of the topic
		newButton.attr("data-topic", topics[i]);

		// capitalize the letter of the beginning of the word
		newButton.text(capitalizeFirstLetter(topics[i]));

		// Appends the button to the screen
		$("#topicButtons").append(newButton);
	}
}

// Function to display gifs
function displayGIFs() {

	// Empties out the container before appending new gifs
	$("#topics-container").empty();

	var API_KEY = "q2a7jKIczJhZcfD88OllAFA2u1nXNb00"; 
	var limit = 10; 
	var queryTopic = $(this).attr("data-topic"); 

	// query URL for each GIPHY's documentation
    var queryURL = "https://api.giphy.com/v1/gifs/search?q=" + 
    queryTopic + "&api_key=" + API_KEY + "&limit=" + limit;

	// call AJAX
	$.ajax({
		url: queryURL,
		method: "GET"
	}).done(function(response) {

		// create divs in the output array
		for (var i = 0; i < response.data.length; i++) {
			var newDiv = $("<div>");
			var rating = response.data[i]["rating"];
			var stillImage = response.data[i]["images"]["fixed_height_still"]["url"];
			var gif = response.data[i]["images"]["fixed_height"]["url"];
			var imgCaption = capitalizeFirstLetter(response.data[i]["title"]);

			// Create a new image tag in the div
			var gifDiv = $("<img>");
			gifDiv.attr("src", gif);
			gifDiv.attr("alt", imgCaption);
			gifDiv.addClass("gif-image");

			// save image data
			gifDiv.data("values", {
				"still-image": stillImage, 
				"gif": gif,
				"state": "still"
			});

			// append rating display
			newDiv.append("<p>Rating: " + rating + "</p>");
			newDiv.append(gifDiv);
			newDiv.addClass("gifs");

			// append the div to the container 
			$("#topics-container").append(newDiv);
		}
	});
}

// still/moving control for "GIF-lization"
function displayGIF() {

	// if/else the current state is still/moving
	if ($(this).data().values.state === "still") {
		$(this).attr('src', $(this).data().values.gif);
		$(this).data().values.state = "moving";
	} 
	else if ($(this).data().values.state === "moving") {
		$(this).attr('src', $(this).data().values["still-image"]);
		$(this).data().values.state = "still";
	}
}

// for more than one key words, capticalize the first letter of each
function capitalizeFirstLetter(string) {
  return string.replace(/\w\S*/g, function(txt) {
      return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase(); });
}

setButtons();