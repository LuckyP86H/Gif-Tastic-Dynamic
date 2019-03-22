# GifTastic Dynamic Web

    General Information

    1. use the GIPHY API to make a dynamic web page that populates with gifs of your choice; then, call the GIPHY API
    
    2. use JavaScript and jQuery to change the HTML of your site.


## Instructions:

1. Create an array of strings, each one related to a topic that interests you. Save it to a variable called `topics`.

 - make a list of people with different titles or roles

2.  Take the topics in this array and create buttons in the HTML. 

 - using a loop that appends a button for each string in the array.

3. When the user clicks on a button, the page should grab 10 static, non-animated gif images from the GIPHY API and place them on the page.

4. When the user clicks one of the still GIPHY images, the gif should animate. If the user clicks the gif again, it should stop playing.

5. Under every gif, display its rating (PG, G, so on).
    
 - This data is provided by the GIPHY API.
        
 - Only once images displaying with button presses, move on to the next step.

6. Add a form to the page takes the value from a user input box and adds it into the `topics` array. Then make a function call that takes each topic in the array remakes the buttons on the page.
    

## Note: 

**Future improvement**

1. Ensure the app is fully mobile responsive.

2. Allow users to request additional gifs to be added to the page.

    - Each request should ADD 10 gifs to the page, NOT overwrite the existing gifs.

3. List additional metadata (title, tags, etc) for each gif in a clean and readable format.

4. Include a 1-click download button for each gif, this should work across device types.

5. Integrate this search with additional APIs such as OMDB, or Bands in Town. Be creative and build something you are proud to showcase in your portfolio

6. Allow users to add their favorite gifs to a **favorites** section. 

    - This should persist even when they select or add a new topic.
    
    - This could look into making this section persist even when the page is reloaded *(via localStorage or cookies)*.


